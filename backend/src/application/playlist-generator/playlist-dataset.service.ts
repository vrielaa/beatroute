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
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
  SkippedPlaylistTrack,
} from "./types.js";

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
 * Tworzy serwis uzupełniający Spotify ID o metadane i pomiary generatora.
 * Zależności odpowiadają wyłącznie za pobieranie danych; nie są wywoływane
 * przez filtrowanie i ranking. Serwis nie odczytuje plików ani zmiennych środowiska.
 *
 * @param dependencies - Operacje odczytu metadanych i cech audio.
 * @returns Serwis przygotowania zbioru, bez produkcyjnych zależności i stanu globalnego.
 */
function createPlaylistDatasetService({
  getSpotifyTrackById,
  getAudioFeaturesBySpotifyIds,
}: PlaylistDatasetDependencies) {
  /**
   * Pobiera metadane po kolei, a następnie cechy wyłącznie dla znalezionych utworów.
   * Status 404 oznacza pominięty utwór; pozostałe wyjątki przerywają przygotowanie
   * i są przekazywane wywołującemu, bez udawania pustego wyniku.
   * Zachowuje ID i kolejność z pliku, wiążąc cechy po spotifyId, nie po pozycji odpowiedzi.
   * Pomija utwory bez metadanych lub wszystkich użytecznych pomiarów.
   * Częściowe braki zapisuje jako null i opisuje w incompleteTracks; zero pozostaje pomiarem.
   * Nie stosuje kryteriów, nie generuje rankingu i nie modyfikuje wejścia.
   *
   * @param file - Wcześniej zwalidowany plik z unikalnymi Spotify ID.
   * @param accessToken - Token dostępu używany wyłącznie do pobrania metadanych Spotify.
   * @returns Zbiór do ponownego użycia oraz informacje o pominiętych i niekompletnych utworach.
   */
  async function prepareDataset(
    file: PlaylistTrackIdsFile,
    accessToken: string
  ): Promise<PreparedPlaylistDataset> {
    const metadataById = new Map<string, { name: string; artists: string[] }>();

    for (const spotifyId of file.spotifyTrackIds) {
      try {
        const sourceTrack = await getSpotifyTrackById(spotifyId, accessToken);
        const metadata = normalizeTrackMetadata(sourceTrack);

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

    const audioResults = await getAudioFeatures(
      Array.from(metadataById.keys())
    );
    const audioById = new Map(
      audioResults.map((result) => [result.spotifyId, result])
    );
    const tracks: PlaylistTrack[] = [];
    const skippedTracks: SkippedPlaylistTrack[] = [];
    const incompleteTracks: IncompletePlaylistTrack[] = [];

    for (const spotifyId of file.spotifyTrackIds) {
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

  return { prepareDataset };
}

/** Przygotowuje przycięte nazwy; brak nazwy utworu lub jakiegokolwiek wykonawcy oznacza null. */
function normalizeTrackMetadata(track: PlaylistSourceTrack) {
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
