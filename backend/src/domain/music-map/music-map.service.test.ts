import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SpotifyTrack, TrackAudioFeatures } from "./music-map.types.js";

const { getCurrentUserTopTracksMock, getManyAudioFeaturesMock } = vi.hoisted(
  () => ({
    getCurrentUserTopTracksMock: vi.fn(),
    getManyAudioFeaturesMock: vi.fn(),
  })
);

vi.mock("../../integrations/spotify/spotify.gateway.js", () => ({
  getCurrentUserTopTracks: getCurrentUserTopTracksMock,
}));

vi.mock("../../integrations/reccobeats/reccobeats.service.js", () => ({
  reccoBeatsService: {
    getManyTrackAudioFeaturesBySpotifyIds: getManyAudioFeaturesMock,
  },
}));

import {
  buildMusicMap,
  buildMusicMapProjection,
  getTopTracksWithAudioFeatures,
} from "./music-map.service.js";

describe("music map service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTopTracksWithAudioFeatures", () => {
    it("combines Spotify tracks, ReccoBeats features and request metadata", async () => {
      const track = createSpotifyTrack("track-1");
      const features = createAudioFeatures("track-1");
      getCurrentUserTopTracksMock.mockResolvedValue({
        items: [track],
        total: 25,
      });
      getManyAudioFeaturesMock.mockResolvedValue([features]);

      const result = await getTopTracksWithAudioFeatures({
        accessToken: "spotify-token",
        limit: 10,
        timeRange: "medium_term",
      });

      expect(getCurrentUserTopTracksMock).toHaveBeenCalledWith(
        "spotify-token",
        { limit: 10, timeRange: "medium_term" }
      );
      expect(getManyAudioFeaturesMock).toHaveBeenCalledWith(["track-1"]);
      expect(result.tracks).toEqual([track]);
      expect(result.audioFeatures).toEqual([features]);
      expect(result.metadata).toEqual({
        timeRange: "medium_term",
        requestedLimit: 10,
        spotifyReturnedTracksCount: 1,
        spotifyTotalTracksCount: 25,
      });
    });

    it("does not call ReccoBeats when Spotify returns no tracks", async () => {
      getCurrentUserTopTracksMock.mockResolvedValue({ items: [], total: 0 });

      const result = await getTopTracksWithAudioFeatures({
        accessToken: "spotify-token",
        limit: 10,
        timeRange: "short_term",
      });

      expect(getManyAudioFeaturesMock).not.toHaveBeenCalled();
      expect(result.tracks).toEqual([]);
      expect(result.audioFeatures).toEqual([]);
    });
  });

  describe("buildMusicMapProjection", () => {
    it("builds a map point and cluster from complete audio features", () => {
      const result = buildMusicMapProjection({
        tracks: [createSpotifyTrack("track-1")],
        audioFeatures: [createAudioFeatures("track-1")],
      });

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
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0]).toMatchObject({
        id: 0,
        tracksCount: 1,
        trackIds: ["track-1"],
      });
    });

    it("reports a track skipped when ReccoBeats returned an error", () => {
      const result = buildMusicMapProjection({
        tracks: [createSpotifyTrack("track-1")],
        audioFeatures: [
          {
            spotifyId: "track-1",
            error: "ReccoBeats track not found",
          },
        ],
      });

      expect(result.points).toEqual([]);
      expect(result.skippedTracks).toEqual([
        expect.objectContaining({
          id: "track-1",
          reason: "ReccoBeats track not found",
        }),
      ]);
    });

    it("reports a track skipped when audio features are incomplete", () => {
      const result = buildMusicMapProjection({
        tracks: [createSpotifyTrack("track-1")],
        audioFeatures: [{ spotifyId: "track-1", energy: 0.8 }],
      });

      expect(result.points).toEqual([]);
      expect(result.skippedTracks[0].reason).toBe("Incomplete audio features");
    });

    it("keeps metadata and requested cluster count in the response", () => {
      const result = buildMusicMapProjection({
        tracks: [],
        audioFeatures: [],
        requestedClusterCount: 4,
        metadata: {
          timeRange: "long_term",
          requestedLimit: 40,
          spotifyReturnedTracksCount: 0,
          spotifyTotalTracksCount: 0,
        },
      });

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

  describe("buildMusicMap", () => {
    it("runs the complete music map flow with mocked integrations", async () => {
      getCurrentUserTopTracksMock.mockResolvedValue({
        items: [createSpotifyTrack("track-1")],
        total: 1,
      });
      getManyAudioFeaturesMock.mockResolvedValue([
        createAudioFeatures("track-1"),
      ]);

      const result = await buildMusicMap({
        accessToken: "spotify-token",
        limit: 10,
        timeRange: "long_term",
        clusterCount: null,
      });

      expect(result.points).toHaveLength(1);
      expect(result.timeRange).toBe("long_term");
      expect(result.requestedLimit).toBe(10);
    });
  });
});

function createSpotifyTrack(id: string): SpotifyTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: [{ name: "Artist" }],
    album: {
      name: "Album",
      images: [{ url: "https://example.com/cover.jpg" }],
    },
    external_urls: {
      spotify: `https://open.spotify.com/track/${id}`,
    },
  };
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<TrackAudioFeatures> = {}
): TrackAudioFeatures {
  return {
    spotifyId,
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
  };
}
