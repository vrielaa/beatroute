import { describe, expect, it, vi } from "vitest";

import { SpotifyApiError } from "./spotify-api.error.js";
import { createSpotifyGateway } from "./spotify.gateway.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

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
      expect.objectContaining({
        method: "GET",
        body: undefined,
        headers: {
          Authorization: "Bearer access-token",
        },
        signal: expect.any(AbortSignal),
      })
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

    await expect(
      gateway[methodName]("access-token", {
        limit: 25,
        timeRange: "medium_term",
      })
    ).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://spotify.test/v1/me/top/${resource}?limit=25&time_range=medium_term`,
      expect.objectContaining({
        method: "GET",
        body: undefined,
        headers: {
          Authorization: "Bearer access-token",
        },
        signal: expect.any(AbortSignal),
      })
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
      expect.objectContaining({
        method: "GET",
        body: undefined,
        headers: {
          Authorization: "Bearer access-token",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("routes requests through an injected scheduler", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const gateway = createSpotifyGateway({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ id: "user-id", display_name: "Gabriela" })
        ),
      apiRoot: "https://spotify.test/v1",
      scheduler,
    });

    await gateway.getCurrentUserProfile("access-token");

    expect(scheduleSpy).toHaveBeenCalledOnce();
  });

  it("still retries GET requests through the scheduler after a temporary failure", async () => {
    const profile = { id: "user-id", display_name: "Gabriela" };
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Unavailable" } }, { status: 503 })
      )
      .mockResolvedValueOnce(jsonResponse(profile));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      scheduler,
      requestPolicy: { maxAttempts: 2, baseRetryDelayMs: 0 },
    });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).resolves.toEqual(profile);

    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://spotify.test/v1/me",
      expect.objectContaining({
        method: "GET",
        body: undefined,
        headers: { Authorization: "Bearer access-token" },
        signal: expect.any(AbortSignal),
      })
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

  it("preserves Retry-After from the final rate-limit response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { message: "Too many requests" } },
        {
          status: 429,
          headers: { "Retry-After": "30" },
        }
      )
    );
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 30,
    });
  });

  it("classifies an exhausted request timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const gateway = createSpotifyGateway({
      fetchImpl: vi.fn().mockRejectedValue(timeoutError),
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      category: "timeout",
      upstreamStatus: 504,
      data: timeoutError,
    });
  });

  it("classifies an exhausted network failure", async () => {
    const connectionError = new TypeError("fetch failed");
    const gateway = createSpotifyGateway({
      fetchImpl: vi.fn().mockRejectedValue(connectionError),
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 1 },
    });

    const request = gateway.getCurrentUserProfile("access-token");

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "network",
      upstreamStatus: 502,
      data: connectionError,
    });
  });

  it("rejects a successful HTTP response that is not valid JSON", async () => {
    const gateway = createSpotifyGateway({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(new Response("not JSON", { status: 200 })),
      apiRoot: "https://spotify.test/v1",
    });

    const request = gateway.getCurrentUserProfile("access-token");

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "invalid-response",
      upstreamStatus: 200,
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
