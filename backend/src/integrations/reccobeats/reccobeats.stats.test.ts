import { describe, expect, it } from "vitest";

import { calculateAudioStats } from "./reccobeats.stats.js";
import type {
  ReccoBeatsTrackAudioFeatures,
  ReccoBeatsTrackAudioFeaturesResult,
} from "./reccobeats.types.js";

describe("ReccoBeats audio statistics", () => {
  it("calculates averages, dominant values and threshold percentages", () => {
    const tracks: ReccoBeatsTrackAudioFeaturesResult[] = [
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
      majorPercentage: 0,
      minorPercentage: 0,
      liveTrackPercentage: 0,
      instrumentalTrackPercentage: 0,
      speechHeavyTrackPercentage: 0,
    });
  });
});

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<ReccoBeatsTrackAudioFeatures> = {}
): ReccoBeatsTrackAudioFeatures {
  return {
    id: `recco-${spotifyId}`,
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
