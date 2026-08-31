import { describe, expect, it, vi } from "vitest";

import type {
  LastfmTrackInfo,
  LastfmTrackService,
} from "@integrations/lastfm/track/types.js";
import type {
  SpotifyGateway,
  SpotifyTrackApiResponse,
  SpotifyTrackSummary,
} from "@integrations/spotify/spotify.types.js";
import { createGetSpotifyTrackLastfmInfo } from "./get-spotify-track-lastfm-info.js";

describe("Spotify and Last.fm track profile", () => {
  it("combines mapped Spotify data with Last.fm track information", async () => {
    const dependencies = createDependencies();
    const spotifyTrack = createSpotifyTrack();
    const spotifySummary = createSpotifySummary();
    const lastfmTrackInfo = createLastfmTrackInfo();

    dependencies.getSpotifyTrackById.mockResolvedValue(spotifyTrack);
    dependencies.mapSpotifyTrackForLastfm.mockReturnValue({
      artist: "Cher",
      track: "Believe",
    });
    dependencies.getLastfmTrackInfo.mockResolvedValue(lastfmTrackInfo);
    dependencies.mapSpotifyTrackResponse.mockReturnValue(spotifySummary);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);
    const result = await getTrackProfile({
      spotifyTrackId: "spotify-track-id",
      accessToken: "access-token",
    });

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledWith(
      "spotify-track-id",
      "access-token"
    );
    expect(dependencies.mapSpotifyTrackForLastfm).toHaveBeenCalledWith(
      spotifyTrack
    );
    expect(dependencies.getLastfmTrackInfo).toHaveBeenCalledWith({
      artist: "Cher",
      track: "Believe",
    });
    expect(dependencies.mapSpotifyTrackResponse).toHaveBeenCalledWith(
      spotifyTrack
    );
    expect(result).toEqual({
      spotify: spotifySummary,
      lastfm: lastfmTrackInfo,
    });
  });

  it("stops processing when Spotify cannot return the track", async () => {
    const dependencies = createDependencies();
    const spotifyError = new Error("Spotify unavailable");
    dependencies.getSpotifyTrackById.mockRejectedValue(spotifyError);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);

    await expect(
      getTrackProfile({
        spotifyTrackId: "spotify-track-id",
        accessToken: "access-token",
      })
    ).rejects.toBe(spotifyError);
    expect(dependencies.mapSpotifyTrackForLastfm).not.toHaveBeenCalled();
    expect(dependencies.getLastfmTrackInfo).not.toHaveBeenCalled();
    expect(dependencies.mapSpotifyTrackResponse).not.toHaveBeenCalled();
  });

  it("propagates a Last.fm error instead of returning an incomplete profile", async () => {
    const dependencies = createDependencies();
    const lastfmError = new Error("Last.fm unavailable");
    dependencies.getSpotifyTrackById.mockResolvedValue(createSpotifyTrack());
    dependencies.mapSpotifyTrackForLastfm.mockReturnValue({
      artist: "Cher",
      track: "Believe",
    });
    dependencies.getLastfmTrackInfo.mockRejectedValue(lastfmError);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);

    await expect(
      getTrackProfile({
        spotifyTrackId: "spotify-track-id",
        accessToken: "access-token",
      })
    ).rejects.toBe(lastfmError);
    expect(dependencies.mapSpotifyTrackResponse).not.toHaveBeenCalled();
  });
});

function createDependencies() {
  return {
    getSpotifyTrackById: vi.fn<SpotifyGateway["getSpotifyTrackById"]>(),
    getLastfmTrackInfo: vi.fn<LastfmTrackService["getTrackInfo"]>(),
    mapSpotifyTrackForLastfm: vi.fn(
      (_spotifyTrack: SpotifyTrackApiResponse) => ({
        artist: "Cher",
        track: "Believe",
      })
    ),
    mapSpotifyTrackResponse: vi.fn(
      (_spotifyTrack: SpotifyTrackApiResponse): SpotifyTrackSummary =>
        createSpotifySummary()
    ),
  };
}

function createSpotifyTrack(): SpotifyTrackApiResponse {
  return {
    id: "spotify-track-id",
    name: "Believe",
    artists: [{ name: "Cher" }],
    album: {
      name: "Believe",
      artists: [{ name: "Cher" }],
      images: [],
    },
    duration_ms: 240_000,
    track_number: 1,
    external_urls: {
      spotify: "https://open.spotify.com/track/spotify-track-id",
    },
  };
}

function createSpotifySummary(): SpotifyTrackSummary {
  return {
    id: "spotify-track-id",
    name: "Believe",
    artists: ["Cher"],
    album: "Believe",
    durationMs: 240_000,
    spotifyUrl: "https://open.spotify.com/track/spotify-track-id",
  };
}

function createLastfmTrackInfo(): LastfmTrackInfo {
  return {
    name: "Believe",
    artist: "Cher",
    mbid: null,
    url: "https://www.last.fm/music/Cher/_/Believe",
    genre: "pop",
    genreCandidates: ["pop"],
    tags: [{ name: "pop", url: "https://www.last.fm/tag/pop" }],
    genreSource: "lastfm-top-tags",
    genreIsFallback: false,
  };
}
