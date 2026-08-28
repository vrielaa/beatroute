import { describe, expect, it, vi } from "vitest";

import { SpotifyApiError } from "./spotify-api.error.js";
import { createSpotifyGateway } from "./spotify.gateway.js";

describe("Spotify gateway", () => {
  it("fetches a track using an encoded ID and bearer token", async () => {
    const track = createSpotifyTrack();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(track));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await expect(
      gateway.getSpotifyTrackById("track/id", "access-token")
    ).resolves.toEqual(track);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/tracks/track%2Fid",
      {
        headers: {
          Authorization: "Bearer access-token",
        },
      }
    );
  });

  it.each([
    ["tracks", "getCurrentUserTopTracks"],
    ["artists", "getCurrentUserTopArtists"],
  ] as const)("builds the top %s endpoint", async (resource, methodName) => {
    const responseBody = createSpotifyPage();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await gateway[methodName]("access-token", {
      limit: 25,
      timeRange: "medium_term",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://spotify.test/v1/me/top/${resource}?limit=25&time_range=medium_term`,
      expect.any(Object)
    );
  });

  it("fetches the current user profile", async () => {
    const profile = { id: "user-id", display_name: "Gabriela" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(profile));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/me",
      expect.any(Object)
    );
  });

  it("throws SpotifyApiError containing the API response", async () => {
    const errorData = { error: { message: "The access token expired" } };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorData, { status: 401 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    const request = gateway.getCurrentUserProfile("expired-token");

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      message: "The access token expired",
      status: 401,
      data: errorData,
    });
  });
});

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createSpotifyTrack() {
  return {
    id: "track-id",
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
      spotify: "https://open.spotify.com/track/track-id",
    },
  };
}

function createSpotifyPage() {
  return {
    href: "https://spotify.test/page",
    items: [],
    limit: 25,
    next: null,
    offset: 0,
    previous: null,
    total: 0,
  };
}
