import { describe, expect, it } from "vitest";

import { calculateAudioStats } from "./audio-statistics.js";
import type { TrackAudioFeatures, TrackAudioFeaturesResult } from "./types.js";

describe("track audio statistics", () => {
  it("calculates averages, dominant values and threshold percentages", () => {
    const tracks: TrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify1", {
        tempo: 120,
        energy: 0.8,
        danceability: 0.6,
        valence: 0.7,
        acousticness: 0.2,
        instrumentalness: 0.6,
        liveness: 0.9,
        speechiness: 0.7,
        loudness: -5,
        key: 4,
        mode: 1,
        timeSignature: 4,
      }),
      createAudioFeatures("spotify2", {
        tempo: 130,
        energy: 0.6,
        danceability: 0.8,
        valence: 0.3,
        acousticness: 0.4,
        instrumentalness: 0.2,
        liveness: 0.2,
        speechiness: 0.1,
        loudness: -7,
        key: 4,
        mode: 0,
        timeSignature: 3,
      }),
      { spotifyId: "failed", error: "Audio features unavailable" },
    ];

    expect(calculateAudioStats(tracks)).toEqual({
      trackCount: 2,
      averageBpm: 125,
      averageEnergy: 0.7,
      averageDanceability: 0.7,
      averageValence: 0.5,
      averageAcousticness: 0.3,
      averageInstrumentalness: 0.4,
      averageLiveness: 0.55,
      averageSpeechiness: 0.4,
      averageLoudness: -6,
      dominantKey: 4,
      dominantMode: 1,
      dominantTimeSignature: 4,
      majorPercentage: 50,
      minorPercentage: 50,
      liveTrackPercentage: 50,
      instrumentalTrackPercentage: 50,
      speechHeavyTrackPercentage: 50,
      measurementCounts: {
        mode: 2,
        liveness: 2,
        instrumentalness: 2,
        speechiness: 2,
      },
    });
  });

  it("omits missing feature values from their individual calculations", () => {
    const tracks = [
      createAudioFeatures("spotify1", { energy: 0.8, tempo: null }),
      createAudioFeatures("spotify2", { energy: null, tempo: 123.6 }),
    ];

    const result = calculateAudioStats(tracks);

    expect(result.averageEnergy).toBe(0.8);
    expect(result.averageBpm).toBe(124);
    expect(result.trackCount).toBe(2);
  });

  it("does not dilute percentages with missing measurements or failed reads", () => {
    const result = calculateAudioStats([
      createAudioFeatures("measured", {
        liveness: 0.9,
        instrumentalness: 0.8,
        speechiness: 0.7,
        mode: 1,
      }),
      createAudioFeatures("missing", {
        liveness: null,
        instrumentalness: null,
        speechiness: null,
        mode: null,
      }),
      { spotifyId: "failed", error: "Track not found" },
    ]);

    expect(result).toMatchObject({
      trackCount: 2,
      liveTrackPercentage: 100,
      instrumentalTrackPercentage: 100,
      speechHeavyTrackPercentage: 100,
      majorPercentage: 100,
      minorPercentage: 0,
      measurementCounts: {
        mode: 1,
        liveness: 1,
        instrumentalness: 1,
        speechiness: 1,
      },
    });
  });

  it("uses a separate measurement count for each feature", () => {
    const result = calculateAudioStats([
      createAudioFeatures("first", {
        liveness: 0.9,
        instrumentalness: null,
        speechiness: null,
        mode: null,
      }),
      createAudioFeatures("second", {
        liveness: null,
        instrumentalness: 0.8,
        speechiness: 0.7,
        mode: 1,
      }),
      createAudioFeatures("third", {
        liveness: 0.1,
        instrumentalness: null,
        speechiness: 0.1,
        mode: 0,
      }),
    ]);

    expect(result).toMatchObject({
      liveTrackPercentage: 50,
      instrumentalTrackPercentage: 100,
      speechHeavyTrackPercentage: 50,
      majorPercentage: 50,
      minorPercentage: 50,
      measurementCounts: {
        mode: 2,
        liveness: 2,
        instrumentalness: 1,
        speechiness: 2,
      },
    });
  });

  it("returns zero for measured values that do not exceed classification thresholds", () => {
    const result = calculateAudioStats([
      createAudioFeatures("boundary", {
        liveness: 0.8,
        instrumentalness: 0.5,
        speechiness: 0.66,
      }),
    ]);

    expect(result).toMatchObject({
      liveTrackPercentage: 0,
      instrumentalTrackPercentage: 0,
      speechHeavyTrackPercentage: 0,
      measurementCounts: { liveness: 1, instrumentalness: 1, speechiness: 1 },
    });
  });

  it("returns null when successful reads contain no measurements for a percentage", () => {
    const result = calculateAudioStats([
      createAudioFeatures("missing", {
        liveness: null,
        instrumentalness: null,
        speechiness: null,
        mode: null,
      }),
    ]);

    expect(result).toMatchObject({
      trackCount: 1,
      averageEnergy: 0.8,
      liveTrackPercentage: null,
      instrumentalTrackPercentage: null,
      speechHeavyTrackPercentage: null,
      majorPercentage: null,
      minorPercentage: null,
      measurementCounts: {
        mode: 0,
        liveness: 0,
        instrumentalness: 0,
        speechiness: 0,
      },
    });
  });

  it("does not count non-finite feature values or unrecognized modes as measurements", () => {
    const result = calculateAudioStats([
      createAudioFeatures("invalid", {
        liveness: Number.NaN,
        instrumentalness: Number.POSITIVE_INFINITY,
        speechiness: Number.NEGATIVE_INFINITY,
        mode: 2,
      }),
    ]);

    expect(result).toMatchObject({
      averageLiveness: null,
      averageInstrumentalness: null,
      averageSpeechiness: null,
      liveTrackPercentage: null,
      instrumentalTrackPercentage: null,
      speechHeavyTrackPercentage: null,
      majorPercentage: null,
      minorPercentage: null,
      measurementCounts: {
        mode: 0,
        liveness: 0,
        instrumentalness: 0,
        speechiness: 0,
      },
    });
  });

  it("returns empty statistics when no track has audio features", () => {
    const result = calculateAudioStats([
      { spotifyId: "missing", error: "Track not found" },
    ]);

    expect(result).toEqual({
      trackCount: 0,
      averageBpm: null,
      averageEnergy: null,
      averageDanceability: null,
      averageValence: null,
      averageAcousticness: null,
      averageInstrumentalness: null,
      averageLiveness: null,
      averageSpeechiness: null,
      averageLoudness: null,
      dominantKey: null,
      dominantMode: null,
      dominantTimeSignature: null,
      majorPercentage: null,
      minorPercentage: null,
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
    expect(calculateAudioStats([])).toEqual(result);
  });
});

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
