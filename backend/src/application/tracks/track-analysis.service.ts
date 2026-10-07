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
    return buildAudioStatsSummary(audioFeatures, spotifyIds.length);
  }

  async function getTracksAnalysis(spotifyIds: string[]): Promise<{
    stats: TrackAudioStatsSummary;
    audioFeatures: TrackAudioFeaturesResult[];
  }> {
    const audioFeatures = await getAudioFeatures(spotifyIds);

    return {
      audioFeatures,
      stats: buildAudioStatsSummary(audioFeatures, spotifyIds.length),
    };
  }

  return { getAudioFeatures, getAudioStats, getTracksAnalysis };
}

/**
 * Oblicza statystyki i uzupełnia je o liczbę żądanych i odnalezionych utworów.
 * Obie operacje analizy korzystają z tego samego sposobu budowania podsumowania.
 *
 * @param audioFeatures - Wyniki pobrania cech audio, w tym nieudane odczyty.
 * @param totalTracksCount - Liczba utworów przekazanych do analizy.
 * @returns Statystyki poprawnych odczytów wraz z informacją o kompletności danych.
 */
function buildAudioStatsSummary(
  audioFeatures: TrackAudioFeaturesResult[],
  totalTracksCount: number
): TrackAudioStatsSummary {
  const stats = calculateAudioStats(audioFeatures);

  return {
    ...stats,
    totalTracksCount,
    foundTracksCount: stats.trackCount,
  };
}

export { createTrackAnalysisService };
export type {
  TrackAudioFeaturesReader,
  TrackAnalysisDependencies,
  TrackAnalysisService,
};
