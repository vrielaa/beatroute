import { describe, expect, it, vi } from "vitest";

import type {
  MusicProfileSpotifyTrack,
  MusicProfileTrackInfo,
} from "./music-profile.ports.js";
import { createGetSpotifyTrackLastfmInfo } from "./get-spotify-track-lastfm-info.js";

describe("Spotify and Last.fm track profile", () => {
  it("combines mapped Spotify data with Last.fm track information", async () => {
    const dependencies = createDependencies();
    const spotifySummary = createSpotifySummary();
    const lastfmTrackInfo = createLastfmTrackInfo();

    dependencies.spotifyTracks.getTrack.mockResolvedValue({
      track: spotifySummary,
      metadataIdentifier: { artist: "Cher", track: "Believe" },
    });
    dependencies.trackMetadata.getTrackInfo.mockResolvedValue(lastfmTrackInfo);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);
    const result = await getTrackProfile({
      spotifyTrackId: "spotify-track-id",
      accessToken: "access-token",
    });

    expect(dependencies.spotifyTracks.getTrack).toHaveBeenCalledWith(
      "spotify-track-id",
      "access-token"
    );
    expect(dependencies.trackMetadata.getTrackInfo).toHaveBeenCalledWith({
      artist: "Cher",
      track: "Believe",
    });
    expect(result).toEqual({
      spotify: spotifySummary,
      lastfm: lastfmTrackInfo,
    });
  });

  it("stops processing when Spotify cannot return the track", async () => {
    const dependencies = createDependencies();
    const spotifyError = new Error("Spotify unavailable");
    dependencies.spotifyTracks.getTrack.mockRejectedValue(spotifyError);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);

    await expect(
      getTrackProfile({
        spotifyTrackId: "spotify-track-id",
        accessToken: "access-token",
      })
    ).rejects.toBe(spotifyError);
    expect(dependencies.trackMetadata.getTrackInfo).not.toHaveBeenCalled();
  });

  it("propagates a Last.fm error instead of returning an incomplete profile", async () => {
    const dependencies = createDependencies();
    const lastfmError = new Error("Last.fm unavailable");
    dependencies.spotifyTracks.getTrack.mockResolvedValue({
      track: createSpotifySummary(),
      metadataIdentifier: { artist: "Cher", track: "Believe" },
    });
    dependencies.trackMetadata.getTrackInfo.mockRejectedValue(lastfmError);

    const getTrackProfile = createGetSpotifyTrackLastfmInfo(dependencies);

    await expect(
      getTrackProfile({
        spotifyTrackId: "spotify-track-id",
        accessToken: "access-token",
      })
    ).rejects.toBe(lastfmError);
  });
});

function createDependencies() {
  return {
    spotifyTracks: {
      getTrack: vi.fn(),
    },
    trackMetadata: {
      getTrackInfo: vi.fn(),
    },
  };
}

function createSpotifySummary(): MusicProfileSpotifyTrack {
  return {
    id: "spotify-track-id",
    name: "Believe",
    artists: ["Cher"],
    album: "Believe",
    durationMs: 240_000,
    spotifyUrl: "https://open.spotify.com/track/spotify-track-id",
  };
}

function createLastfmTrackInfo(): MusicProfileTrackInfo {
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
