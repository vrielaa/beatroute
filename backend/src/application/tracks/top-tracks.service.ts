import { MUSIC_MAP_FEATURE_KEYS } from "@domain/music-map/features.js";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";
import type {
  SpotifyGateway,
  SpotifyTrackApiResponse,
} from "@integrations/spotify/spotify.types.js";
import type { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import type {
  TopTracksBatchReader,
  TopTracksPurpose,
} from "./top-tracks.types.js";

/**
 * Zewnętrzne odczyty wymagane do przygotowania partii.
 * @property spotifyGateway - Czyta jedną stronę top utworów.
 * @property audioFeaturesReader - Czyta cechy z rozróżnieniem braków i awarii.
 */
type TopTracksDependencies = {
  spotifyGateway: Pick<SpotifyGateway, "getCurrentUserTopTracks">;
  audioFeaturesReader: Pick<
    typeof reccoBeatsService,
    "getManyTrackAudioFeaturesBySpotifyIds"
  >;
};

/**
 * Przygotowuje jedną partię dla dashboardu, profilu albo mapy. Nie wykonuje
 * pętli dobierania ani obliczeń statystycznych. Zachowuje kolejność Spotify,
 * pomija niedostępne metadane i dobiera poziom kompletności do zastosowania.
 * Techniczny błąd dowolnego odczytu cech przerywa partię, zamiast zwiększać
 * liczbę pominięć. Metadane są używane z odpowiedzi strony, bez odczytów per ID.
 */
function createTopTracksService({
  spotifyGateway,
  audioFeaturesReader,
}: TopTracksDependencies): TopTracksBatchReader {
  return {
    async getTopTracksBatch(accessToken, selection) {
      const page = await spotifyGateway.getCurrentUserTopTracks(
        accessToken,
        selection
      );
      const uniqueTracks = new Map<string, SpotifyTrackApiResponse>();

      for (const track of page.items) {
        if (hasUsableMetadata(track) && !uniqueTracks.has(track.id)) {
          uniqueTracks.set(track.id, track);
        }
      }

      const results = uniqueTracks.size
        ? await audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds(
            [...uniqueTracks.keys()],
            { errorMode: "strict" }
          )
        : [];
      const featuresById = new Map(
        results.map((result) => [result.spotifyId, result])
      );
      const tracks: SpotifyTrackApiResponse[] = [];
      const audioFeatures: TrackAudioFeatures[] = [];

      for (const track of uniqueTracks.values()) {
        const features = featuresById.get(track.id);
        if (
          features &&
          !("error" in features) &&
          hasRequiredMeasurements(features, selection.purpose)
        ) {
          tracks.push({
            ...track,
            name: track.name.trim(),
            artists: track.artists.map((artist) => ({
              ...artist,
              name: artist.name.trim(),
            })),
          });
          audioFeatures.push(features);
        }
      }

      return {
        tracks,
        audioFeatures,
        processedItems: page.items.length,
        skippedItems: page.items.length - tracks.length,
        totalItems: page.total,
        nextOffset: page.next === null ? null : page.offset + page.items.length,
      };
    },
  };
}

/** Sprawdza metadane potrzebne w widokach; pliki lokalne i niedostępne utwory pomija. */
function hasUsableMetadata(track: SpotifyTrackApiResponse): boolean {
  return Boolean(
    track &&
    typeof track.id === "string" &&
    /^[A-Za-z0-9]{22}$/.test(track.id) &&
    typeof track.name === "string" &&
    track.name.trim() &&
    Array.isArray(track.artists) &&
    track.artists.length &&
    track.artists.every(
      (artist) => typeof artist?.name === "string" && artist.name.trim()
    ) &&
    track.is_local !== true &&
    track.is_playable !== false
  );
}

/** Statystyki wymagają jednego użytecznego pomiaru; PCA wszystkich cech swojego wektora. */
function hasRequiredMeasurements(
  features: TrackAudioFeatures,
  purpose: TopTracksPurpose
): boolean {
  const isFiniteMeasurement = (key: (typeof MUSIC_MAP_FEATURE_KEYS)[number]) =>
    typeof features[key] === "number" && Number.isFinite(features[key]);

  if (purpose === "music-map") {
    return MUSIC_MAP_FEATURE_KEYS.every(isFiniteMeasurement);
  }

  return (
    MUSIC_MAP_FEATURE_KEYS.some((key) => {
      if (key === "key")
        return (
          features.key !== null && features.key >= 0 && isFiniteMeasurement(key)
        );
      if (key === "mode") return features.mode === 0 || features.mode === 1;
      return isFiniteMeasurement(key);
    }) ||
    (typeof features.timeSignature === "number" &&
      Number.isFinite(features.timeSignature) &&
      features.timeSignature > 0)
  );
}

export { createTopTracksService };
