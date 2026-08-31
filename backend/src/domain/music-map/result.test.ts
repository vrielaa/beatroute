import { describe, expect, it } from "vitest";
import { buildMusicMapResult } from "./result.js";
import type {
  AudioFeatureValues,
  MusicMapDataset,
  MusicMapTrack,
  TrackAudioFeaturesLookup,
} from "./types.js";

describe("music map result", () => {
  it("builds a point and cluster from complete audio features", () => {
    const result = buildMusicMapResult(
      createDataset(
        [createTrack("track-1")],
        [createFoundAudioFeatures("track-1")]
      )
    );

    expect(result.tracksWithAudioFeaturesCount).toBe(1);
    expect(result.skippedTracksCount).toBe(0);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      id: "track-1",
      name: "Track track-1",
      artists: ["Artist"],
      cluster: 0,
      x: 0,
      y: 0,
    });
    expect(result.clusters[0]).toMatchObject({
      id: 0,
      tracksCount: 1,
      trackIds: ["track-1"],
    });
  });

  it("reports a track skipped when fetching audio features failed", () => {
    const result = buildMusicMapResult(
      createDataset(
        [createTrack("track-1")],
        [
          {
            status: "failed",
            trackId: "track-1",
            reason: "ReccoBeats track not found",
          },
        ]
      )
    );

    expect(result.points).toEqual([]);
    expect(result.skippedTracks).toEqual([
      expect.objectContaining({
        id: "track-1",
        reason: "ReccoBeats track not found",
      }),
    ]);
  });

  it("reports a track skipped when audio features are incomplete", () => {
    const result = buildMusicMapResult(
      createDataset(
        [createTrack("track-1")],
        [
          {
            status: "found",
            trackId: "track-1",
            features: { energy: 0.8 },
          },
        ]
      )
    );

    expect(result.points).toEqual([]);
    expect(result.skippedTracks[0].reason).toBe("Incomplete audio features");
  });

  it("keeps request metadata and manually selected cluster count", () => {
    const result = buildMusicMapResult(createDataset([], []), 4);

    expect(result).toMatchObject({
      source: "spotify-top-tracks-reccobeats-audio-features",
      requestedClusterCount: 4,
      selectedClusterCount: 0,
      selectedClusterCountSource: "fallback",
      timeRange: "long_term",
      requestedLimit: 40,
    });
  });
});

function createDataset(
  tracks: MusicMapTrack[],
  audioFeatures: TrackAudioFeaturesLookup[]
): MusicMapDataset {
  return {
    tracks,
    audioFeatures,
    metadata: {
      timeRange: "long_term",
      requestedLimit: 40,
      spotifyReturnedTracksCount: tracks.length,
      spotifyTotalTracksCount: tracks.length,
    },
  };
}

function createTrack(id: string): MusicMapTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: ["Artist"],
    album: "Album",
    imageUrl: "https://example.com/cover.jpg",
    spotifyUrl: `https://open.spotify.com/track/${id}`,
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
