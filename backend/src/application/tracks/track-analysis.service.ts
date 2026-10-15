import { calculateAudioStats } from "@domain/tracks/audio-statistics.js";
import type { TrackAudioFeaturesResult } from "@domain/tracks/types.js";
import type { TrackAudioStatsSummary } from "./track-analysis.types.js";

/** Port zbiorczego odczytu cech audio. */
type TrackAudioFeaturesReader = {
  getManyTrackAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]>;
};

/**
 * Zależności wymagane przez analizę cech audio utworów.
 *
 * @property audioFeaturesReader - Pobiera wyniki cech audio dla wskazanych utworów.
 */
type TrackAnalysisDependencies = {
  audioFeaturesReader: TrackAudioFeaturesReader;
};

/** Operacje analizy cech audio udostępniane warstwie HTTP. */
type TrackAnalysisService = {
  getTracksAnalysis(spotifyIds: string[]): Promise<{
    stats: TrackAudioStatsSummary;
    audioFeatures: TrackAudioFeaturesResult[];
  }>;
};

/**
 * Tworzy operację jednorazowego pobrania cech audio wraz z ich statystykami.
 */
function createTrackAnalysisService({
  audioFeaturesReader,
}: TrackAnalysisDependencies): TrackAnalysisService {
  async function getTracksAnalysis(spotifyIds: string[]): Promise<{
    stats: TrackAudioStatsSummary;
    audioFeatures: TrackAudioFeaturesResult[];
  }> {
    const audioFeatures =
      await audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds(
        spotifyIds
      );
    return {
      audioFeatures,
      stats: summarizeAudioFeatures(audioFeatures, spotifyIds.length),
    };
  }

  return { getTracksAnalysis };
}

/** Oblicza statystyki ze wszystkich zebranych pomiarów, bez odczytu z API ani średnich ze średnich. */
function summarizeAudioFeatures(
  audioFeatures: TrackAudioFeaturesResult[],
  totalTracksCount = audioFeatures.length
): TrackAudioStatsSummary {
  const stats = calculateAudioStats(audioFeatures);
  return { ...stats, totalTracksCount, foundTracksCount: stats.trackCount };
}

export { createTrackAnalysisService, summarizeAudioFeatures };
export type {
  TrackAudioFeaturesReader,
  TrackAnalysisDependencies,
  TrackAnalysisService,
};
