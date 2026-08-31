import { describe, expect, it, vi } from "vitest";
import { createMusicMapService } from "./service.js";
import type { ReccoBeatsService } from "@integrations/reccobeats/reccobeats.types.js";
import type {
  SpotifyGateway,
  SpotifyTopTracksApiResponse,
  SpotifyTrackApiResponse,
} from "@integrations/spotify/spotify.types.js";

describe("music map service", () => {
  it("builds a map from Spotify tracks and ReccoBeats features", async () => {
    const dependencies = createDependencies();
    const track = createSpotifyTrack("track-1");
    dependencies.spotifyGateway.getCurrentUserTopTracks.mockResolvedValue(
      createTopTracksResponse([track], 25)
    );
    dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [createAudioFeatures("track-1")]
    );
    const service = createMusicMapService(dependencies);

    const result = await service.buildMusicMap({
      accessToken: "spotify-token",
      limit: 10,
      timeRange: "medium_term",
      clusterCount: null,
    });

    expect(
      dependencies.spotifyGateway.getCurrentUserTopTracks
    ).toHaveBeenCalledWith("spotify-token", {
      limit: 10,
      timeRange: "medium_term",
    });
    expect(
      dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledWith(["track-1"]);
    expect(result).toMatchObject({
      requestedLimit: 10,
      timeRange: "medium_term",
      spotifyReturnedTracksCount: 1,
      spotifyTotalTracksCount: 25,
      tracksWithAudioFeaturesCount: 1,
      skippedTracksCount: 0,
    });
    expect(result.points).toEqual([
      expect.objectContaining({
        id: "track-1",
        name: "Track track-1",
        artists: ["Artist"],
        album: "Album",
        imageUrl: "https://example.com/cover.jpg",
        spotifyUrl: "https://open.spotify.com/track/track-1",
      }),
    ]);
  });

  it("maps an audio provider failure to a skipped domain track", async () => {
    const dependencies = createDependencies();
    dependencies.spotifyGateway.getCurrentUserTopTracks.mockResolvedValue(
      createTopTracksResponse([createSpotifyTrack("missing")], 1)
    );
    dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [
        {
          spotifyId: "missing",
          error: "ReccoBeats track not found",
        },
      ]
    );
    const service = createMusicMapService(dependencies);

    const result = await service.buildMusicMap({
      accessToken: "spotify-token",
      limit: 10,
      timeRange: "medium_term",
      clusterCount: null,
    });

    expect(result.points).toEqual([]);
    expect(result.skippedTracks).toEqual([
      expect.objectContaining({
        id: "missing",
        reason: "ReccoBeats track not found",
      }),
    ]);
  });

  it("does not call ReccoBeats when Spotify returns no tracks", async () => {
    const dependencies = createDependencies();
    dependencies.spotifyGateway.getCurrentUserTopTracks.mockResolvedValue(
      createTopTracksResponse([], 0)
    );
    const service = createMusicMapService(dependencies);

    const result = await service.buildMusicMap({
      accessToken: "spotify-token",
      limit: 40,
      timeRange: "long_term",
      clusterCount: null,
    });

    expect(
      dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds
    ).not.toHaveBeenCalled();
    expect(result.points).toEqual([]);
    expect(result.tracksWithAudioFeaturesCount).toBe(0);
  });
});

function createDependencies() {
  return {
    spotifyGateway: {
      getCurrentUserTopTracks:
        vi.fn<SpotifyGateway["getCurrentUserTopTracks"]>(),
    },
    reccoBeatsService: {
      getManyTrackAudioFeaturesBySpotifyIds:
        vi.fn<ReccoBeatsService["getManyTrackAudioFeaturesBySpotifyIds"]>(),
    },
  };
}

function createTopTracksResponse(
  items: SpotifyTrackApiResponse[],
  total: number
): SpotifyTopTracksApiResponse {
  return {
    href: "https://api.spotify.com/v1/me/top/tracks",
    items,
    limit: 40,
    next: null,
    offset: 0,
    previous: null,
    total,
  };
}

function createSpotifyTrack(id: string): SpotifyTrackApiResponse {
  return {
    id,
    name: `Track ${id}`,
    artists: [{ name: "Artist" }],
    album: {
      name: "Album",
      artists: [{ name: "Artist" }],
      images: [
        {
          url: "https://example.com/cover.jpg",
          height: 640,
          width: 640,
        },
      ],
    },
    duration_ms: 180_000,
    track_number: 1,
    external_urls: {
      spotify: `https://open.spotify.com/track/${id}`,
    },
  };
}

function createAudioFeatures(spotifyId: string) {
  return {
    id: `recco-${spotifyId}`,
    spotifyId,
    acousticness: 0.2,
    danceability: 0.7,
    energy: 0.8,
    instrumentalness: 0.1,
    key: 4,
    liveness: 0.15,
    loudness: -5,
    mode: 1,
    speechiness: 0.05,
    tempo: 125,
    timeSignature: 4,
    valence: 0.65,
  };
}
