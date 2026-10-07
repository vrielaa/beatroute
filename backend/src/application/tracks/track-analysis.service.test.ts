import { describe, expect, it, vi } from "vitest";

import { createTrackAnalysisService } from "./track-analysis.service.js";
import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
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
      createAudioFeatures("spotify-1", { tempo: 100, energy: 0.4 }),
      createAudioFeatures("spotify-2", { tempo: 140, energy: 0.8 }),
      { spotifyId: "spotify-3", error: "Track not found" },
    ];
    dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      results
    );
    const service = createTrackAnalysisService(dependencies);

    const stats = await service.getAudioStats([
      "spotify-1",
      "spotify-2",
      "spotify-3",
    ]);

    expect(stats).toMatchObject({
      trackCount: 2,
      totalTracksCount: 3,
      foundTracksCount: 2,
      averageBpm: 120,
      averageEnergy: 0.6,
      averageDanceability: 0.7,
    });
  });

  it("returns both statistics and audio features", async () => {
    const dependencies = createDependencies();
    const results: TrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify-1"),
      { spotifyId: "spotify-2", error: "Track not found" },
    ];
    dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      results
    );
    const service = createTrackAnalysisService(dependencies);

    const analysis = await service.getTracksAnalysis([
      "spotify-1",
      "spotify-2",
    ]);

    expect(
      dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledOnce();
    expect(
      dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledWith(["spotify-1", "spotify-2"]);
    expect(analysis).toMatchObject({
      stats: {
        trackCount: 1,
        totalTracksCount: 2,
        foundTracksCount: 1,
        averageBpm: 125,
        averageEnergy: 0.8,
      },
      audioFeatures: results,
    });
  });

  it.each(["getAudioStats", "getTracksAnalysis"] as const)(
    "%s reports missing statistics when no track has audio features",
    async (method) => {
      const dependencies = createDependencies();
      dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
        [{ spotifyId: "spotify-1", error: "Track not found" }]
      );
      const service = createTrackAnalysisService(dependencies);

      const result = await service[method](["spotify-1"]);
      const stats = "stats" in result ? result.stats : result;

      expect(stats).toMatchObject({
        trackCount: 0,
        totalTracksCount: 1,
        foundTracksCount: 0,
        averageBpm: null,
        averageEnergy: null,
        liveTrackPercentage: null,
        instrumentalTrackPercentage: null,
        speechHeavyTrackPercentage: null,
        measurementCounts: {
          mode: 0,
          liveness: 0,
          instrumentalness: 0,
          speechiness: 0,
        },
      });
    }
  );

  it.each(["getAudioStats", "getTracksAnalysis"] as const)(
    "%s preserves per-feature measurement counts and the number of requested tracks",
    async (method) => {
      const dependencies = createDependencies();
      dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
        [
          createAudioFeatures("measured", {
            liveness: 0.9,
            instrumentalness: null,
            speechiness: null,
          }),
          createAudioFeatures("missing", {
            liveness: null,
            instrumentalness: null,
            speechiness: null,
          }),
          { spotifyId: "failed", error: "Track not found" },
        ]
      );
      const service = createTrackAnalysisService(dependencies);

      const result = await service[method](["measured", "missing", "failed"]);
      const stats = "stats" in result ? result.stats : result;

      expect(stats).toMatchObject({
        totalTracksCount: 3,
        foundTracksCount: 2,
        liveTrackPercentage: 100,
        instrumentalTrackPercentage: null,
        speechHeavyTrackPercentage: null,
        measurementCounts: {
          mode: 2,
          liveness: 1,
          instrumentalness: 0,
          speechiness: 0,
        },
      });
      expect(
        dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
      ).toHaveBeenCalledOnce();
    }
  );

  it.each(["getAudioStats", "getTracksAnalysis"] as const)(
    "%s propagates errors from the audio features reader",
    async (method) => {
      const dependencies = createDependencies();
      const error = new Error("Audio features unavailable");
      dependencies.audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockRejectedValue(
        error
      );
      const service = createTrackAnalysisService(dependencies);

      await expect(service[method](["spotify-1"])).rejects.toBe(error);
    }
  );
});

function createDependencies() {
  return {
    audioFeaturesReader: {
      getManyTrackAudioFeaturesBySpotifyIds:
        vi.fn<(spotifyIds: string[]) => Promise<TrackAudioFeaturesResult[]>>(),
    },
  };
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<TrackAudioFeatures> = {}
): TrackAudioFeatures {
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
    ...overrides,
  };
}
