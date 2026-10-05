import type {
  TrackAudioFeaturesResult,
  TrackAudioStats,
} from "@domain/tracks/types.js";
import type { TrackAudioStatsSummary } from "./track-analysis.types.js";

/** Port zbiorczego odczytu cech audio. */
type TrackAudioFeaturesReader = {
  getManyTrackAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]>;
};

/** Zależności wymagane przez analizę cech audio utworów. */
type TrackAnalysisDependencies = {
  audioFeaturesReader: TrackAudioFeaturesReader;
  calculateStats: (features: TrackAudioFeaturesResult[]) => TrackAudioStats;
};

/** Operacje analizy cech audio udostępniane warstwie HTTP. */
type TrackAnalysisService = {
  getAudioFeatures(spotifyIds: string[]): Promise<TrackAudioFeaturesResult[]>;
  getAudioStats(spotifyIds: string[]): Promise<TrackAudioStatsSummary>;
  getTracksAnalysis(spotifyIds: string[]): Promise<{
    stats: TrackAudioStatsSummary;
    audioFeatures: TrackAudioFeaturesResult[];
  }>;
};

/**
 * Tworzy przypadki użycia pobierania cech audio i obliczania ich statystyk.
 */
function createTrackAnalysisService({
  audioFeaturesReader,
  calculateStats,
}: TrackAnalysisDependencies): TrackAnalysisService {
  function getAudioFeatures(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]> {
    return audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds(
      spotifyIds
    );
  }

  async function getAudioStats(
    spotifyIds: string[]
  ): Promise<TrackAudioStatsSummary> {
    const audioFeatures = await getAudioFeatures(spotifyIds);
    const stats = calculateStats(audioFeatures);

    return {
      ...stats,
      totalTracksCount: spotifyIds.length,
      foundTracksCount: stats.trackCount,
    };
  }

  async function getTracksAnalysis(spotifyIds: string[]): Promise<{
    stats: TrackAudioStatsSummary;
    audioFeatures: TrackAudioFeaturesResult[];
  }> {
    const audioFeatures =
      await audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds(
        spotifyIds
      );

    const calculatedStats = calculateStats(audioFeatures);

    return {
      audioFeatures,
      stats: {
        ...calculatedStats,
        totalTracksCount: spotifyIds.length,
        foundTracksCount: calculatedStats.trackCount,
      },
    };
  }

  return { getAudioFeatures, getAudioStats, getTracksAnalysis };
}

export { createTrackAnalysisService };
export type {
  TrackAudioFeaturesReader,
  TrackAnalysisDependencies,
  TrackAnalysisService,
};
