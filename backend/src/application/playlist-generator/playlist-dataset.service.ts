import { IntegrationApiError } from "@integrations/integration-api.error.js";
import type {
  PlaylistAudioFeatures,
  PlaylistTrack,
} from "@domain/playlist-generator/types.js";
import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
} from "@domain/tracks/types.js";
import type {
  IncompletePlaylistTrack,
  PlaylistDatasetDependencies,
  PlaylistSourceTrack,
  PlaylistTrackMetadata,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
  SkippedPlaylistTrack,
  PreparedSavedTracksPage,
} from "./types.js";

/**
 * Poprawne metadane zachowane w lokalnym cache do czasu wygaśnięcia.
 *
 * @property metadata - Nazwa utworu i lista nazw wykonawców.
 * @property expiresAtMs - Moment wygaśnięcia wpisu jako czas Unix w milisekundach.
 */
type CachedTrackMetadata = {
  metadata: PlaylistTrackMetadata;
  expiresAtMs: number;
};

const TRACK_METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_METADATA_CACHE_ENTRIES = 1_000;

/** Rozmiar porcji ID ogranicza długość URL odczytu cech, nie tempo ani równoległość HTTP. */
const AUDIO_FEATURES_REQUEST_SIZE = 40;
const AUDIO_FEATURE_KEYS: (keyof PlaylistAudioFeatures)[] = [
  "tempo",
  "energy",
  "danceability",
  "valence",
  "acousticness",
  "instrumentalness",
  "speechiness",
  "liveness",
];

/**
 * Tworzy serwis przygotowujący metadane i pomiary generatora z ID lub biblioteki Spotify.
 * Zależności odpowiadają wyłącznie za pobieranie danych; nie są wywoływane
 * przez filtrowanie i ranking. Serwis nie odczytuje plików ani zmiennych środowiska.
 * Wariant z ID zachowuje poprawne metadane w cache instancji przez 24 godziny,
 * do 1000 wpisów łącznie. Kontekst cache oddziela dane poszczególnych sesji.
 * Wariant biblioteki korzysta bezpośrednio z metadanych zwróconych na stronie
 * zapisanych utworów, bez odczytu i uzupełniania cache pojedynczych ID.
 * Odczyt metadanych z ID oddziela od prywatnego przygotowania pomiarów
 * i składania zbioru; ta część nie zależy od sposobu dostarczenia metadanych.
 *
 * @param dependencies - Odczyt pojedynczego utworu, strony biblioteki i cech audio.
 * @returns Serwis przygotowania zbioru, bez produkcyjnych zależności i stanu globalnego.
 */
function createPlaylistDatasetService({
  getSpotifyTrackById,
  getAudioFeaturesBySpotifyIds,
  getCurrentUserSavedTracks,
}: PlaylistDatasetDependencies) {
  const metadataCache = new Map<string, CachedTrackMetadata>();

  /**
   * Pobiera metadane po kolei i przekazuje pełną listę ID oraz znalezione
   * metadane do prepareTracks, które pobiera pomiary i składa zbiór.
   * Status 404 oznacza pominięty utwór; pozostałe wyjątki przerywają przygotowanie
   * i są przekazywane wywołującemu, bez udawania pustego wyniku.
   * Zachowuje ID i kolejność z pliku, wiążąc cechy po spotifyId, nie po pozycji odpowiedzi.
   * Pomija utwory bez metadanych lub wszystkich użytecznych pomiarów.
   * Częściowe braki zapisuje jako null i opisuje w incompleteTracks; zero pozostaje pomiarem.
   * Nie stosuje kryteriów, nie generuje rankingu i nie modyfikuje wejścia.
   * Udane odczyty metadanych są zachowywane od razu, także gdy późniejszy odczyt
   * lub pobieranie cech zakończy się błędem. Cache nie zachowuje błędów ani braków.
   * Bez niepustego cacheScope metadane są pobierane bez korzystania z cache.
   *
   * @param file - Wcześniej zwalidowany plik z unikalnymi Spotify ID.
   * @param accessToken - Token dostępu używany wyłącznie do pobrania metadanych Spotify.
   * @param cacheScope - Zaufany kontekst sesji przekazany przez backend; nie token
   * ani wartość z pliku użytkownika. Jego zmiana oznacza oddzielny zestaw wpisów.
   * @returns Zbiór do ponownego użycia oraz informacje o pominiętych i niekompletnych utworach.
   */
  async function prepareDataset(
    file: PlaylistTrackIdsFile,
    accessToken: string,
    cacheScope?: string
  ): Promise<PreparedPlaylistDataset> {
    removeExpiredMetadata();
    const metadataById = new Map<string, PlaylistTrackMetadata>();

    for (const spotifyId of file.spotifyTrackIds) {
      try {
        const metadata = await getTrackMetadata(
          spotifyId,
          accessToken,
          cacheScope
        );

        if (metadata) {
          metadataById.set(spotifyId, metadata);
        }
      } catch (error) {
        if (
          !(error instanceof IntegrationApiError) ||
          error.upstreamStatus !== 404
        ) {
          throw error;
        }
      }
    }

    return prepareTracks(file.spotifyTrackIds, metadataById);
  }

  /** Korzysta z aktualnych metadanych danej sesji albo pobiera i zachowuje poprawny odczyt. */
  async function getTrackMetadata(
    spotifyId: string,
    accessToken: string,
    cacheScope: string | undefined
  ): Promise<PlaylistTrackMetadata | null> {
    const cacheKey = cacheScope
      ? JSON.stringify([cacheScope, spotifyId])
      : null;
    const cachedMetadata =
      cacheKey === null ? null : getCachedMetadata(cacheKey);

    if (cachedMetadata) {
      return cachedMetadata;
    }

    const sourceTrack = await getSpotifyTrackById(spotifyId, accessToken);
    const metadata = normalizeTrackMetadata(sourceTrack);

    if (metadata && cacheKey !== null) {
      cacheMetadata(cacheKey, metadata);
    }

    return metadata;
  }

  /** Zwraca kopię aktualnego wpisu; wygasłe metadane usuwa i traktuje jako brak wpisu. */
  function getCachedMetadata(cacheKey: string): PlaylistTrackMetadata | null {
    const entry = metadataCache.get(cacheKey);

    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= Date.now()) {
      metadataCache.delete(cacheKey);
      return null;
    }

    return copyTrackMetadata(entry.metadata);
  }

  /** Zapisuje kopię metadanych na 24 godziny i usuwa najstarszy wpis po przekroczeniu limitu. */
  function cacheMetadata(
    cacheKey: string,
    metadata: PlaylistTrackMetadata
  ): void {
    metadataCache.delete(cacheKey);
    metadataCache.set(cacheKey, {
      metadata: copyTrackMetadata(metadata),
      expiresAtMs: Date.now() + TRACK_METADATA_CACHE_TTL_MS,
    });

    if (metadataCache.size > MAX_METADATA_CACHE_ENTRIES) {
      const oldestKey = metadataCache.keys().next().value;

      if (oldestKey !== undefined) {
        metadataCache.delete(oldestKey);
      }
    }
  }

  /** Usuwa wygasłe wpisy wszystkich sesji przed rozpoczęciem kolejnego przygotowania. */
  function removeExpiredMetadata(): void {
    const currentTimeMs = Date.now();

    for (const [key, entry] of metadataCache) {
      if (entry.expiresAtMs <= currentTimeMs) {
        metadataCache.delete(key);
      }
    }
  }

  /** Pobiera cechy w porcjach, nie wysyłając do źródła pustej ani nadmiernie długiej listy ID. */
  async function getAudioFeatures(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]> {
    const results: TrackAudioFeaturesResult[] = [];

    for (
      let start = 0;
      start < spotifyIds.length;
      start += AUDIO_FEATURES_REQUEST_SIZE
    ) {
      const ids = spotifyIds.slice(start, start + AUDIO_FEATURES_REQUEST_SIZE);
      const batch = await getAudioFeaturesBySpotifyIds(ids);
      results.push(...batch);
    }

    return results;
  }

  /**
   * Łączy dostarczone metadane z pomiarami audio, bez odczytów Spotify ani cache metadanych.
   * Pobiera cechy tylko dla kluczy metadataById, w kolejnych porcjach do 40 ID.
   * Odpowiedzi wiąże po spotifyId, a nie po pozycji w tablicy dostawcy.
   * Pełną listę spotifyIds wykorzystuje do zachowania kolejności wyników
   * i zgłoszenia brakujących metadanych, także dla ID nieobecnych w mapie.
   * Brak odpowiedzi, wynik z błędem lub brak wszystkich użytecznych pomiarów
   * oznacza pominięcie utworu. Częściowe braki zapisuje jako null i opisuje
   * w incompleteTracks; zero pozostaje poprawnym pomiarem cech z zakresu 0–1.
   * Wyjątek całego odczytu przerywa przygotowanie, bez zwracania częściowego zbioru.
   * Nie zmienia wejścia, nie filtruje wymagań użytkownika ani nie ustala rankingu.
   *
   * @param spotifyIds - Pełna, uporządkowana lista unikalnych ID, również bez metadanych.
   * @param metadataById - Znormalizowane metadane znalezionych ID z listy wejściowej.
   * @returns Zbiór wersji 1 oraz uporządkowane informacje o pominięciach i brakach pomiarów.
   */
  async function prepareTracks(
    spotifyIds: string[],
    metadataById: Map<string, PlaylistTrackMetadata>
  ): Promise<PreparedPlaylistDataset> {
    const audioResults = await getAudioFeatures(
      Array.from(metadataById.keys())
    );
    const audioById = new Map(
      audioResults.map((result) => [result.spotifyId, result])
    );
    const tracks: PlaylistTrack[] = [];
    const skippedTracks: SkippedPlaylistTrack[] = [];
    const incompleteTracks: IncompletePlaylistTrack[] = [];

    for (const spotifyId of spotifyIds) {
      const metadata = metadataById.get(spotifyId);

      if (!metadata) {
        skippedTracks.push({ spotifyId, reason: "metadata-unavailable" });
        continue;
      }

      const audioResult = audioById.get(spotifyId);

      if (!audioResult || "error" in audioResult) {
        skippedTracks.push({ spotifyId, reason: "audio-features-unavailable" });
        continue;
      }

      const audioFeatures = normalizePlaylistAudioFeatures(audioResult);
      const missingFeatures = AUDIO_FEATURE_KEYS.filter(
        (key) => audioFeatures[key] === null
      );

      if (missingFeatures.length === AUDIO_FEATURE_KEYS.length) {
        skippedTracks.push({ spotifyId, reason: "audio-features-unavailable" });
        continue;
      }

      if (missingFeatures.length > 0) {
        incompleteTracks.push({ spotifyId, missingFeatures });
      }

      tracks.push({ id: spotifyId, ...metadata, audioFeatures });
    }

    return { dataset: { version: 1, tracks }, skippedTracks, incompleteTracks };
  }

  /**
   * Przygotowuje jedną stronę zapisanych utworów w granicach pierwszych 500 pozycji.
   * Pobiera do 50 pozycji, a przy końcu limitu zmniejsza rozmiar strony.
   * Wykorzystuje metadane z odpowiedzi biblioteki, bez getSpotifyTrackById.
   * Pomija track: null, pliki lokalne, utwory z is_playable: false i błędne ID.
   * Brak opcjonalnej flagi nie oznacza niedostępności. Dla pozostałych pozycji
   * zachowuje pierwsze wystąpienie ID na tej stronie; wielkość liter ma znaczenie.
   * Przycinanie metadanych i przygotowanie pomiarów współdzieli z wariantem plikowym.
   * Brak użytecznych metadanych lub cech zgłasza w preparedDataset, nie dolicza
   * go ponownie do unavailableItemsCount. Duplikaty nie zwiększają tego licznika.
   * Postęp i następny offset wyznacza z wszystkich odczytanych pozycji strony,
   * również pominiętych i powtórzonych, nie z liczby utworów w gotowym zbiorze.
   * Nie pobiera kolejnych stron, nie ustala rankingu ani nie przechowuje wyniku.
   * Awarie odczytów przekazuje bez zmian; pusta biblioteka jest poprawnym wynikiem.
   *
   * @param offset - Całkowity indeks pierwszej pozycji strony, od 0 do 499.
   * @param accessToken - Token użytkownika z uprawnieniem user-library-read.
   * @returns Przygotowana strona, paginacja i liczba niedostępnych pozycji.
   * @throws RangeError Gdy offset nie mieści się w całkowitym zakresie 0–499.
   */
  async function prepareSavedTracksPage(
    offset: number,
    accessToken: string
  ): Promise<PreparedSavedTracksPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= 500) {
      throw new RangeError(
        "Offset zapisanych utworów musi być liczbą całkowitą od 0 do 499"
      );
    }

    const limit = Math.min(50, 500 - offset);
    const page = await getCurrentUserSavedTracks(accessToken, {
      limit,
      offset,
    });

    const trackIds: string[] = [];
    const metadataById = new Map<string, PlaylistTrackMetadata>();
    const seenTrackIds = new Set<string>();

    let unavailableItemsCount = 0;

    for (const item of page.items) {
      const track = item.track;

      if (
        track === null ||
        track.is_local === true ||
        track.is_playable === false
      ) {
        unavailableItemsCount += 1;
        continue;
      }

      const hasValidSpotifyId = /^[A-Za-z0-9]{22}$/.test(track.id);

      if (!hasValidSpotifyId) {
        unavailableItemsCount += 1;
        continue;
      }

      if (seenTrackIds.has(track.id)) {
        continue;
      }

      seenTrackIds.add(track.id);
      trackIds.push(track.id);

      const metadata = normalizeTrackMetadata(track);

      if (metadata !== null) {
        metadataById.set(track.id, metadata);
      }
    }

    const preparedDataset = await prepareTracks(trackIds, metadataById);
    const processedThrough = offset + page.items.length;
    const preparationLimit = Math.min(page.total, 500);

    const nextOffset =
      processedThrough < preparationLimit ? processedThrough : null;

    return {
      preparedDataset,
      pagination: {
        offset,
        processedItems: page.items.length,
        totalItems: page.total,
        nextOffset,
      },
      unavailableItemsCount,
    };
  }

  return { prepareDataset, prepareSavedTracksPage };
}

/** Przygotowuje przycięte nazwy; brak nazwy utworu lub jakiegokolwiek wykonawcy oznacza null. */
function normalizeTrackMetadata(
  track: PlaylistSourceTrack
): PlaylistTrackMetadata | null {
  if (typeof track?.name !== "string" || !Array.isArray(track?.artists)) {
    return null;
  }

  const name = track.name.trim();
  const artists = track.artists
    .map((artist) =>
      typeof artist?.name === "string" ? artist.name.trim() : ""
    )
    .filter((artist) => artist.length > 0);

  return name && artists.length > 0 ? { name, artists } : null;
}

/** Kopiuje również listę wykonawców, aby zmiana wyniku nie modyfikowała wpisu w cache. */
function copyTrackMetadata(
  metadata: PlaylistTrackMetadata
): PlaylistTrackMetadata {
  return { name: metadata.name, artists: [...metadata.artists] };
}

/** Kopiuje osiem pomiarów generatora, zamieniając brakujące i niepoprawne wartości na null. */
function normalizePlaylistAudioFeatures(
  audio: TrackAudioFeatures
): PlaylistAudioFeatures {
  return {
    tempo:
      typeof audio.tempo === "number" &&
      Number.isFinite(audio.tempo) &&
      audio.tempo > 0
        ? audio.tempo
        : null,
    energy: normalizeUnitMeasurement(audio.energy),
    danceability: normalizeUnitMeasurement(audio.danceability),
    valence: normalizeUnitMeasurement(audio.valence),
    acousticness: normalizeUnitMeasurement(audio.acousticness),
    instrumentalness: normalizeUnitMeasurement(audio.instrumentalness),
    speechiness: normalizeUnitMeasurement(audio.speechiness),
    liveness: normalizeUnitMeasurement(audio.liveness),
  };
}

/** Zachowuje skończoną liczbę od 0 do 1; brak lub błędny pomiar pozostawia nieoceniony. */
function normalizeUnitMeasurement(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

export { createPlaylistDatasetService };
