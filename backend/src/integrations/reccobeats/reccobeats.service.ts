import { defaultReccoBeatsGateway } from "./reccobeats.gateway.js";
import { mapReccoBeatsAudioFeatures } from "./reccobeats.mapper.js";
import { ReccoBeatsApiError } from "./reccobeats-api.error.js";
import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";
import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
} from "@domain/tracks/types.js";

const AUDIO_FEATURES_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_AUDIO_FEATURES_CACHE_ENTRIES = 1_000;

/**
 * Zależności wymagane przez serwis cech audio ReccoBeats.
 *
 * @property reccoBeatsGateway - Wyszukiwanie utworów i odczyt surowych pomiarów.
 */
type ReccoBeatsServiceDependencies = {
  reccoBeatsGateway: ReccoBeatsGateway;
};

/**
 * Sposób obsługi technicznych błędów pojedynczych odczytów.
 *
 * @property errorMode - partial zachowuje dotychczasowe częściowe wyniki;
 * strict przerywa cały odczyt przy dowolnej awarii. Brak utworu lub pomiarów
 * (404) pozostaje wynikiem brakujących danych w obu wariantach.
 */
type ReccoBeatsReadOptions = {
  errorMode?: "partial" | "strict";
};

/**
 * Poprawny odczyt pomiarów zachowany w pamięci instancji serwisu.
 *
 * @property features - Znormalizowane cechy i identyfikatory utworu.
 * @property expiresAt - Termin ważności w milisekundach od początku epoki Unix.
 */
type CachedTrackAudioFeatures = {
  features: TrackAudioFeatures;
  expiresAt: number;
};

/**
 * Tworzy serwis wyszukujący utwory Spotify w ReccoBeats i pobierający ich
 * znormalizowane cechy audio. Wstrzyknięty gateway oddziela logikę serwisu od
 * komunikacji HTTP i pozwala zastąpić zewnętrzne API atrapą w testach.
 * Cache przechowuje do 1000 udanych odczytów przez 24 godziny od pobrania.
 * Jest wspólny dla operacji pojedynczych i zbiorczych tej instancji, według
 * Spotify ID, bez tokenów, danych użytkownika i trwałego zapisu.
 * Błędy oraz odpowiedzi bez żadnego pomiaru nie trafiają do cache.
 *
 * @param dependencies - Gateway udostępniający dane ReccoBeats.
 * @returns Operacje pobierania cech audio dla jednego lub wielu utworów Spotify.
 */
function createReccoBeatsService({
  reccoBeatsGateway,
}: ReccoBeatsServiceDependencies) {
  const audioFeaturesCache = new Map<string, CachedTrackAudioFeatures>();

  /**
   * Pobiera i normalizuje pomiary, zapisując udany odczyt pod Spotify ID.
   * Zapis następuje od razu, również gdy inny odczyt w tej samej partii zawiedzie.
   *
   * @param spotifyId - Identyfikator Spotify służący do odczytu cache.
   * @param reccoBeatsId - Wewnętrzny identyfikator używany do pobrania pomiarów.
   * @returns Cechy z identyfikatorami i brakami zastąpionymi przez `null`.
   */
  async function fetchTrackAudioFeatures(
    spotifyId: string,
    reccoBeatsId: string
  ): Promise<TrackAudioFeatures> {
    const data = await reccoBeatsGateway.getTrackAudioFeatures(reccoBeatsId);
    const features = {
      id: reccoBeatsId,
      spotifyId,
      ...mapReccoBeatsAudioFeatures(data),
    };

    cacheAudioFeatures(features);
    return features;
  }

  /**
   * Wyszukuje utwór po identyfikatorze Spotify, a następnie pobiera jego cechy audio.
   * Ważny wpis cache pomija oba zapytania do ReccoBeats.
   *
   * @param spotifyTrackId - Identyfikator utworu Spotify.
   * @returns Cechy audio wraz z identyfikatorami Spotify i ReccoBeats.
   * @throws {Error} Gdy ReccoBeats nie zwróci odpowiadającego utworu.
   */
  async function getTrackAudioFeaturesBySpotifyId(
    spotifyTrackId: string
  ): Promise<TrackAudioFeatures> {
    removeExpiredAudioFeatures();
    const cached = getCachedAudioFeatures(spotifyTrackId);
    if (cached) return cached;

    const tracks = await reccoBeatsGateway.findTracksBySpotifyIds([
      spotifyTrackId,
    ]);

    const track = tracks.find(
      (candidate) => getSpotifyIdFromHref(candidate.href) === spotifyTrackId
    );
    const reccoBeatsId = track?.id;

    if (!reccoBeatsId) {
      throw new Error(
        `ReccoBeats track not found for Spotify ID: ${spotifyTrackId}`
      );
    }

    return fetchTrackAudioFeatures(spotifyTrackId, reccoBeatsId);
  }

  /**
   * Pobiera cechy audio dla wielu utworów Spotify.
   * Brak dopasowania albo błąd pojedynczego zapytania zapisuje w wyniku danego
   * utworu, nie przerywając przetwarzania pozostałych elementów.
   * W trybie strict każdy techniczny błąd przerywa całą partię, także gdy inne
   * odczyty się powiodły. Umożliwia to dobieranie utworów bez uznawania awarii
   * za brak danych; już uruchomione odczyty mogą nadal się zakończyć.
   * Domyślny tryb partial zachowuje istniejące zachowanie:
   * jeśli nie udał się żaden odczyt i wystąpił błąd inny niż brak danych 404,
   * przekazuje oryginalny wyjątek zamiast przedstawiać awarię jako pusty zbiór.
   * Zachowuje dzięki temu status, kategorię i Retry-After dla warstwy HTTP.
   * Wyszukiwanie i pobranie pomiarów obejmuje wyłącznie ID bez ważnego wpisu
   * cache. Zwraca wyniki w kolejności wejścia, w tym kopie zapisanych pomiarów.
   *
   * @param spotifyTrackIds - Identyfikatory utworów Spotify do przetworzenia.
   * @param options - Zasady obsługi technicznych błędów odczytów.
   * @returns Wynik dla każdego identyfikatora: cechy audio albo opis błędu.
   * @throws Gdy wyszukiwanie zawiedzie, tryb strict napotka awarię pojedynczego
   * odczytu albo domyślny tryb partial nie uzyska żadnego pomiaru wskutek awarii.
   */
  async function getManyTrackAudioFeaturesBySpotifyIds(
    spotifyTrackIds: string[],
    { errorMode = "partial" }: ReccoBeatsReadOptions = {}
  ): Promise<TrackAudioFeaturesResult[]> {
    if (!spotifyTrackIds.length) {
      return [];
    }

    removeExpiredAudioFeatures();
    const cachedFeaturesById = new Map<string, TrackAudioFeatures>();

    for (const spotifyId of spotifyTrackIds) {
      const cached = getCachedAudioFeatures(spotifyId);
      if (cached) cachedFeaturesById.set(spotifyId, cached);
    }

    const missingIds = [...new Set(spotifyTrackIds)].filter(
      (id) => !cachedFeaturesById.has(id)
    );
    const tracks = missingIds.length
      ? await reccoBeatsGateway.findTracksBySpotifyIds(missingIds)
      : [];

    const idMap = new Map<string, string>();
    const requestErrors: unknown[] = [];

    for (const track of tracks) {
      const spotifyId = getSpotifyIdFromHref(track?.href);

      if (spotifyId && track?.id) {
        idMap.set(spotifyId, track.id);
      }
    }

    const results = await Promise.all(
      spotifyTrackIds.map(async (spotifyId) => {
        const cached = cachedFeaturesById.get(spotifyId);
        if (cached) return { ...cached };

        const reccoBeatsId = idMap.get(spotifyId);

        if (!reccoBeatsId) {
          return {
            spotifyId,
            error: "ReccoBeats track not found",
          };
        }

        try {
          return await fetchTrackAudioFeatures(spotifyId, reccoBeatsId);
        } catch (error) {
          const missingMeasurements =
            error instanceof ReccoBeatsApiError &&
            error.upstreamStatus === 404 &&
            error.category === "upstream-error";

          if (!missingMeasurements) {
            if (errorMode === "strict") {
              throw error;
            }
            requestErrors.push(error);
          }

          console.error(
            "[ReccoBeats service] audio fetch error for",
            spotifyId,
            error
          );

          return {
            spotifyId,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    if (
      requestErrors.length > 0 &&
      results.every((result) => "error" in result)
    ) {
      throw requestErrors[0];
    }

    return results;
  }

  /** Zwraca kopię wpisu, aby zmiana wyniku nie modyfikowała zapisanych pomiarów. */
  function getCachedAudioFeatures(
    spotifyId: string
  ): TrackAudioFeatures | null {
    const entry = audioFeaturesCache.get(spotifyId);
    return entry ? { ...entry.features } : null;
  }

  /**
   * Zachowuje pomiary na 24 godziny od pobrania; zero jest poprawnym pomiarem.
   * Nie zapisuje samych braków. Po przekroczeniu limitu usuwa najstarszy wpis.
   */
  function cacheAudioFeatures(features: TrackAudioFeatures): void {
    const hasMeasurements = Object.values(features).some(
      (value) => typeof value === "number"
    );
    if (!hasMeasurements) return;

    audioFeaturesCache.delete(features.spotifyId);
    audioFeaturesCache.set(features.spotifyId, {
      features: { ...features },
      expiresAt: Date.now() + AUDIO_FEATURES_CACHE_TTL_MS,
    });

    if (audioFeaturesCache.size > MAX_AUDIO_FEATURES_CACHE_ENTRIES) {
      const oldestId = audioFeaturesCache.keys().next().value;
      if (oldestId !== undefined) audioFeaturesCache.delete(oldestId);
    }
  }

  /** Usuwa przeterminowane wpisy przy kolejnym odczycie, bez osobnego timera. */
  function removeExpiredAudioFeatures(): void {
    const now = Date.now();
    for (const [spotifyId, entry] of audioFeaturesCache) {
      if (entry.expiresAt <= now) audioFeaturesCache.delete(spotifyId);
    }
  }

  /**
   * Odczytuje identyfikator utworu Spotify z odnośnika zwróconego przez ReccoBeats.
   *
   * @param href - Odnośnik do utworu Spotify albo brak wartości.
   * @returns Identyfikator Spotify lub `null`, jeśli odnośnik ma inny format.
   */
  function getSpotifyIdFromHref(
    href: string | undefined | null
  ): string | null {
    if (!href) {
      return null;
    }

    const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return match?.[1] ?? null;
  }

  return {
    getTrackAudioFeaturesBySpotifyId,
    getManyTrackAudioFeaturesBySpotifyIds,
  };
}

/** Serwis ReccoBeats korzystający z produkcyjnej konfiguracji gatewaya. */
const reccoBeatsService = createReccoBeatsService({
  reccoBeatsGateway: defaultReccoBeatsGateway,
});

export { createReccoBeatsService, reccoBeatsService };
