import type {
  MusicMapDataset,
  MusicMapDataRequest,
  MusicMapTrack,
  TrackAudioFeaturesLookup,
} from "@domain/music-map/types.js";
import type {
  MusicMapAudioFeaturesReader,
  MusicMapSourceAudioFeaturesResult,
  MusicMapSourceTrack,
  MusicMapTracksReader,
} from "./music-map.ports.js";

/** Zależności wymagane przez przypadek użycia budowania mapy muzycznej. */
type MusicMapDependencies = {
  spotifyGateway: MusicMapTracksReader;
  reccoBeatsService: MusicMapAudioFeaturesReader;
};

/** Operacje pobierania danych źródłowych mapy muzycznej. */
type MusicMapService = {
  /** Pobiera utwory i cechy audio potrzebne do kolejnych analiz. */
  getMusicMapDataset(request: MusicMapDataRequest): Promise<MusicMapDataset>;
};

/**
 * Tworzy serwis łączący dane Spotify i ReccoBeats w zbiór do analizy mapy muzycznej.
 * Jawne zależności umożliwiają testowanie przepływu bez komunikacji z API.
 *
 * @param dependencies - Operacje Spotify i ReccoBeats wymagane przez serwis.
 * @returns Serwis pobierający zbiór, bez wykonywania PCA ani klasteryzacji.
 */
function createMusicMapService({
  spotifyGateway,
  reccoBeatsService,
}: MusicMapDependencies): MusicMapService {
  /**
   * Pobiera top utwory Spotify i odpowiadające im cechy audio z ReccoBeats.
   * Nie wywołuje ReccoBeats, gdy Spotify nie zwróciło żadnego utworu.
   *
   * @param request - Token Spotify oraz parametry wyboru danych do analizy.
   * @returns Dane źródłowe i metadane potrzebne do zbudowania mapy.
   */
  async function getMusicMapDataset(
    request: MusicMapDataRequest
  ): Promise<MusicMapDataset> {
    const { accessToken, limit, timeRange } = request;
    const topTracks = await spotifyGateway.getCurrentUserTopTracks(
      accessToken,
      { limit, timeRange }
    );
    const spotifyTracks = topTracks.items;
    const trackIds = spotifyTracks.map((track) => track.id);
    const reccoBeatsResults = trackIds.length
      ? await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(trackIds)
      : [];

    return {
      tracks: spotifyTracks.map(mapSpotifyTrack),
      audioFeatures: reccoBeatsResults.map(mapTrackAudioFeatures),
      metadata: {
        timeRange,
        requestedLimit: limit,
        spotifyReturnedTracksCount: spotifyTracks.length,
        spotifyTotalTracksCount: topTracks.total,
      },
    };
  }

  return { getMusicMapDataset };
}

/** Mapuje odpowiedź Spotify na niezależny od API model domenowy utworu. */
function mapSpotifyTrack(track: MusicMapSourceTrack): MusicMapTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album?.name ?? null,
    imageUrl: track.album?.images?.[0]?.url ?? null,
    spotifyUrl: track.external_urls?.spotify ?? null,
  };
}

/** Mapuje wynik ReccoBeats na rozłączny wynik wyszukiwania cech w domenie. */
function mapTrackAudioFeatures(
  result: MusicMapSourceAudioFeaturesResult
): TrackAudioFeaturesLookup {
  if ("error" in result) {
    return {
      status: "failed",
      trackId: result.spotifyId,
      reason: result.error,
    };
  }

  const {
    id: _reccoBeatsId,
    spotifyId,
    timeSignature: _timeSignature,
    ...features
  } = result;

  return {
    status: "found",
    trackId: spotifyId,
    features,
  };
}

export { createMusicMapService };
export type { MusicMapService };
