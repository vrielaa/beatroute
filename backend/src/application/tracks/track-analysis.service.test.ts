import { describe, expect, it, vi } from "vitest";

import { createTrackAnalysisService } from "./track-analysis.service.js";
import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
  TrackAudioStats,
} from "@domain/tracks/types.js";

describe("track analysis service", () => {
  it("returns audio features supplied by the reader", async () => {
    const dependencies = createDependencies();
    const results: TrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify-1"),
      { spotifyId: "spotify-2", error: "Track not found" },
    ];
    dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      results
    );
    const service = createTrackAnalysisService(dependencies);

    await expect(
      service.getAudioFeatures(["spotify-1", "spotify-2"])
    ).resolves.toEqual(results);
  });

  it("calculates statistics and adds requested and found track counts", async () => {
    const dependencies = createDependencies();
    const results: TrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify-1"),
      { spotifyId: "spotify-2", error: "Track not found" },
    ];
    dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      results
    );
    dependencies.calculateStats.mockReturnValue(createAudioStats(1));
    const service = createTrackAnalysisService(dependencies);

    const stats = await service.getAudioStats(["spotify-1", "spotify-2"]);

    expect(dependencies.calculateStats).toHaveBeenCalledWith(results);
    expect(stats).toMatchObject({
      trackCount: 1,
      totalTracksCount: 2,
      foundTracksCount: 1,
    });
  });
});

function createDependencies() {
  return {
    audioFeaturesReader: {
      getManyTrackAudioFeaturesBySpotifyIds:
        vi.fn<(spotifyIds: string[]) => Promise<TrackAudioFeaturesResult[]>>(),
    },
    calculateStats:
      vi.fn<(features: TrackAudioFeaturesResult[]) => TrackAudioStats>(),
  };
}

function createAudioFeatures(spotifyId: string): TrackAudioFeatures {
  return {
    id: `source-${spotifyId}`,
    spotifyId,
    acousticness: 0.2,
    danceability: 0.7,
    energy: 0.8,
    instrumentalness: 0.1,
    key: 2,
    liveness: 0.15,
    loudness: -5,
    mode: 1,
    speechiness: 0.05,
    tempo: 125,
    timeSignature: 4,
    valence: 0.65,
  };
}

function createAudioStats(trackCount: number): TrackAudioStats {
  return {
    trackCount,
    averageBpm: 125,
    averageEnergy: 0.8,
    averageDanceability: 0.7,
    averageValence: 0.65,
    averageAcousticness: 0.2,
    averageInstrumentalness: 0.1,
    averageLiveness: 0.15,
    averageSpeechiness: 0.05,
    averageLoudness: -5,
    dominantKey: 2,
    dominantMode: 1,
    dominantTimeSignature: 4,
    majorPercentage: 100,
    minorPercentage: 0,
    liveTrackPercentage: 0,
    instrumentalTrackPercentage: 0,
    speechHeavyTrackPercentage: 0,
  };
}
