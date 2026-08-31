import { describe, expect, it } from "vitest";
import { prepareMusicMapTracks } from "./tracks.js";
import type {
  AudioFeatureValues,
  MusicMapTrack,
  TrackAudioFeaturesLookup,
} from "./types.js";

describe("music map tracks", () => {
  it("matches audio features to tracks by ID", () => {
    const result = prepareMusicMapTracks(
      [createTrack("track-1"), createTrack("track-2")],
      [
        createFoundAudioFeatures("track-2", { energy: 0.2 }),
        createFoundAudioFeatures("track-1"),
      ]
    );

    expect(result.skippedTracks).toEqual([]);
    expect(result.analyzableTracks.map((track) => track.id)).toEqual([
      "track-1",
      "track-2",
    ]);
    expect(result.analyzableTracks[0].audioFeatures.energy).toBe(0.8);
    expect(result.analyzableTracks[1].audioFeatures.energy).toBe(0.2);
  });

  it("skips tracks with missing or non-finite audio features", () => {
    const result = prepareMusicMapTracks(
      [createTrack("missing"), createTrack("invalid")],
      [createFoundAudioFeatures("invalid", { tempo: Number.NaN })]
    );

    expect(result.analyzableTracks).toEqual([]);
    expect(result.skippedTracks).toEqual([
      expect.objectContaining({
        id: "missing",
        reason: "Audio features not found",
      }),
      expect.objectContaining({
        id: "invalid",
        reason: "Incomplete audio features",
      }),
    ]);
  });

  it("keeps the reason returned by the audio features provider", () => {
    const result = prepareMusicMapTracks(
      [createTrack("failed")],
      [
        {
          status: "failed",
          trackId: "failed",
          reason: "Provider unavailable",
        },
      ]
    );

    expect(result.analyzableTracks).toEqual([]);
    expect(result.skippedTracks[0].reason).toBe("Provider unavailable");
  });
});

function createTrack(id: string): MusicMapTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: ["Artist"],
    album: null,
    imageUrl: null,
    spotifyUrl: null,
  };
}

function createFoundAudioFeatures(
  trackId: string,
  overrides: Partial<AudioFeatureValues> = {}
): TrackAudioFeaturesLookup {
  return {
    status: "found",
    trackId,
    features: {
      acousticness: 0.2,
      danceability: 0.7,
      energy: 0.8,
      instrumentalness: 0.1,
      liveness: 0.15,
      speechiness: 0.05,
      valence: 0.65,
      loudness: -5,
      tempo: 125,
      key: 4,
      mode: 1,
      ...overrides,
    },
  };
}
