import { afterEach, describe, expect, it, vi } from "vitest";

import { SpotifyApiError } from "./spotify-api.error.js";
import { createSpotifyGateway } from "./spotify.gateway.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

describe("Spotify gateway", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it("returns a rate-limit response without automatically retrying the read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "1" } }
        )
      );
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 1,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects another user's read during the shared cooldown without fetching", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Too many requests", privateData: "secret" } },
          { status: 429, headers: { "Retry-After": "300" } }
        )
      );
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 5,
      pauseBehavior: "reject",
    });
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });

    await expect(
      gateway.getSpotifyTrackById("track-1", "first-token")
    ).rejects.toMatchObject({
      upstreamStatus: 429,
      retryAfterSeconds: 300,
    });
    await vi.advanceTimersByTimeAsync(1_234);

    const result = gateway.getCurrentUserProfile("second-token");
    await expect(result).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(result).rejects.toMatchObject({
      integration: "spotify",
      category: "rate-limited",
      status: 429,
      upstreamStatus: null,
      retryAfterSeconds: 299,
      data: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects queued reads immediately after a rate-limit response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "300" } }
        )
      );
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });
    const firstResult = gateway.getSpotifyTrackById("track-1", "access-token");
    const secondResult = gateway.getSpotifyTrackById("track-2", "access-token");
    const thirdResult = gateway.getCurrentUserProfile("access-token");

    await Promise.all([
      expect(firstResult).rejects.toMatchObject({ upstreamStatus: 429 }),
      expect(secondResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
        retryAfterSeconds: 300,
      }),
      expect(thirdResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("allows an already running read to finish during a rate-limit cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const profile = { id: "user-id", display_name: "Gabriela" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "300" } }
        )
      )
      .mockResolvedValueOnce(jsonResponse(profile));
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 2,
      pauseBehavior: "reject",
    });
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });
    const firstResult = gateway.getSpotifyTrackById("track-1", "access-token");
    const secondResult = gateway.getCurrentUserProfile("access-token");

    await Promise.all([
      expect(firstResult).rejects.toMatchObject({ category: "rate-limited" }),
      expect(secondResult).resolves.toEqual(profile),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows new reads after the cooldown expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const profile = { id: "user-id", display_name: "Gabriela" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "1" } }
        )
      )
      .mockResolvedValueOnce(jsonResponse(profile));
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      upstreamStatus: 429,
    });
    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      upstreamStatus: null,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves an availability pause without presenting it as a rate limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Service unavailable" } },
          { status: 503, headers: { "Retry-After": "300" } }
        )
      );
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });

    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      upstreamStatus: 503,
    });
    await expect(
      gateway.getCurrentUserProfile("access-token")
    ).rejects.toMatchObject({
      category: "unavailable",
      status: 503,
      upstreamStatus: null,
      retryAfterSeconds: 300,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["create", "add"])(
    "does not send a %s playlist write during a cooldown",
    async (operation) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { message: "Too many requests" } },
            { status: 429, headers: { "Retry-After": "300" } }
          )
        );
      const scheduler = createRequestScheduler({
        maxConcurrentRequests: 1,
        pauseBehavior: "reject",
      });
      const gateway = createSpotifyGateway({ fetchImpl: fetchMock, scheduler });

      await expect(
        gateway.getCurrentUserProfile("access-token")
      ).rejects.toMatchObject({
        upstreamStatus: 429,
      });
      const result =
        operation === "create"
          ? gateway.createPlaylist("access-token", "Playlist")
          : gateway.addTracksToPlaylist("access-token", "playlist-id", [
              "track-1",
            ]);

      await expect(result).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
        retryAfterSeconds: 300,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

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

describe("Spotify playlist creation", () => {
  it("creates a private playlist with a JSON body and returns the 201 response", async () => {
    const playlist = createSpotifyPlaylist();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(playlist, { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await expect(
      gateway.createPlaylist("access-token", playlist.name)
    ).resolves.toEqual(playlist);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/me/playlists",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: playlist.name, public: false }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("creates a playlist through the injected scheduler", async () => {
    const playlist = createSpotifyPlaylist();
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(playlist, { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      scheduler,
    });

    await expect(
      gateway.createPlaylist("access-token", playlist.name)
    ).resolves.toEqual(playlist);

    expect(scheduleSpy).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    {
      status: 401,
      category: "authentication",
      message: "Invalid access token",
    },
    { status: 403, category: "authorization", message: "Insufficient scope" },
    { status: 429, category: "rate-limited", message: "Too many requests" },
    { status: 503, category: "unavailable", message: "Service unavailable" },
  ])(
    "preserves HTTP $status errors without retrying playlist creation",
    async ({ status, category, message }) => {
      const errorData = { error: { message } };
      const response = jsonResponse(errorData, {
        status,
        headers: status === 429 ? { "Retry-After": "30" } : undefined,
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const gateway = createSpotifyGateway({
        fetchImpl: fetchMock,
        apiRoot: "https://spotify.test/v1",
        requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
      });

      const request = gateway.createPlaylist("access-token", "Test playlist");

      await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
      await expect(request).rejects.toMatchObject({
        status,
        upstreamStatus: status,
        category,
        message,
        data: errorData,
        retryAfterSeconds: status === 429 ? 30 : null,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("uses the playlist-specific message when Spotify does not provide one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 403 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await expect(
      gateway.createPlaylist("access-token", "Test playlist")
    ).rejects.toMatchObject({
      message: "Nie udało się utworzyć playlisty na Spotify",
      category: "authorization",
      upstreamStatus: 403,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry playlist creation after a network failure", async () => {
    const connectionError = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(connectionError);
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    const request = gateway.createPlaylist("access-token", "Test playlist");

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "network",
      upstreamStatus: 502,
      data: connectionError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry playlist creation after a timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    await expect(
      gateway.createPlaylist("access-token", "Test playlist")
    ).rejects.toMatchObject({
      category: "timeout",
      upstreamStatus: 504,
      data: timeoutError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a non-JSON response without repeating the POST request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("not JSON", { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    const request = gateway.createPlaylist("access-token", "Test playlist");

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "invalid-response",
      upstreamStatus: 201,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("Adding Spotify playlist tracks", () => {
  it("appends track URIs in input order and returns the 201 snapshot response", async () => {
    const snapshot = { snapshot_id: "updated-snapshot" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(snapshot, { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });
    const trackIds = ["track-3", "track-1", "track-2"];

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", trackIds)
    ).resolves.toEqual(snapshot);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/playlists/playlist-id/items",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [
            "spotify:track:track-3",
            "spotify:track:track-1",
            "spotify:track:track-2",
          ],
        }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(trackIds).toEqual(["track-3", "track-1", "track-2"]);
  });

  it("encodes the playlist ID in the endpoint path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ snapshot_id: "updated-snapshot" }, { status: 201 })
      );
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await gateway.addTracksToPlaylist("access-token", "playlist/id", [
      "track-1",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/playlists/playlist%2Fid/items",
      expect.objectContaining({ method: "POST" })
    );
  });

  it.each([1, 100])("accepts a batch containing %i tracks", async (count) => {
    const snapshot = { snapshot_id: "updated-snapshot" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(snapshot, { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });
    const trackIds = Array.from(
      { length: count },
      (_, index) => `track-${index}`
    );

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", trackIds)
    ).resolves.toEqual(snapshot);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/v1/playlists/playlist-id/items",
      expect.objectContaining({
        body: JSON.stringify({
          uris: trackIds.map((trackId) => `spotify:track:${trackId}`),
        }),
      })
    );
  });

  it.each([0, 101])(
    "rejects a batch containing %i tracks before calling Spotify",
    async (count) => {
      const fetchMock = vi.fn();
      const gateway = createSpotifyGateway({
        fetchImpl: fetchMock,
        apiRoot: "https://spotify.test/v1",
      });
      const trackIds = Array.from(
        { length: count },
        (_, index) => `track-${index}`
      );

      const request = gateway.addTracksToPlaylist(
        "access-token",
        "playlist-id",
        trackIds
      );

      await expect(request).rejects.toBeInstanceOf(RangeError);
      await expect(request).rejects.toThrow(
        "Jedno żądanie dodania utworów musi zawierać od 1 do 100 identyfikatorów"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("adds tracks through the injected scheduler", async () => {
    const snapshot = { snapshot_id: "updated-snapshot" };
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(snapshot, { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      scheduler,
    });

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", ["track-1"])
    ).resolves.toEqual(snapshot);

    expect(scheduleSpy).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    {
      status: 401,
      category: "authentication",
      message: "Invalid access token",
    },
    { status: 403, category: "authorization", message: "Insufficient scope" },
    { status: 429, category: "rate-limited", message: "Too many requests" },
    { status: 503, category: "unavailable", message: "Service unavailable" },
  ])(
    "preserves HTTP $status errors without retrying the addition of tracks",
    async ({ status, category, message }) => {
      const errorData = { error: { message } };
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(errorData, {
          status,
          headers: status === 429 ? { "Retry-After": "30" } : undefined,
        })
      );
      const gateway = createSpotifyGateway({
        fetchImpl: fetchMock,
        apiRoot: "https://spotify.test/v1",
        requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
      });

      const request = gateway.addTracksToPlaylist(
        "access-token",
        "playlist-id",
        ["track-1"]
      );

      await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
      await expect(request).rejects.toMatchObject({
        status,
        upstreamStatus: status,
        category,
        message,
        data: errorData,
        retryAfterSeconds: status === 429 ? 30 : null,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("pauses the scheduler on Retry-After without repeating the addition of tracks", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const pauseSpy = vi.spyOn(scheduler, "pauseFor");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "30" } }
        )
      );
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      scheduler,
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", ["track-1"])
    ).rejects.toMatchObject({
      category: "rate-limited",
      retryAfterSeconds: 30,
    });

    expect(pauseSpy).toHaveBeenCalledWith(30_000, {
      cause: expect.objectContaining({ status: 429 }),
    });
    expect(scheduleSpy).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the track-specific message when Spotify does not provide one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 403 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
    });

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", ["track-1"])
    ).rejects.toMatchObject({
      message: "Nie udało się dodać utworów do playlisty na Spotify",
      category: "authorization",
      upstreamStatus: 403,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry the addition of tracks after a network failure", async () => {
    const connectionError = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(connectionError);
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    const request = gateway.addTracksToPlaylist("access-token", "playlist-id", [
      "track-1",
    ]);

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "network",
      upstreamStatus: 502,
      data: connectionError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry the addition of tracks after a timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    await expect(
      gateway.addTracksToPlaylist("access-token", "playlist-id", ["track-1"])
    ).rejects.toMatchObject({
      category: "timeout",
      upstreamStatus: 504,
      data: timeoutError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a non-JSON response without repeating the addition of tracks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("not JSON", { status: 201 }));
    const gateway = createSpotifyGateway({
      fetchImpl: fetchMock,
      apiRoot: "https://spotify.test/v1",
      requestPolicy: { maxAttempts: 3, baseRetryDelayMs: 0 },
    });

    const request = gateway.addTracksToPlaylist("access-token", "playlist-id", [
      "track-1",
    ]);

    await expect(request).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(request).rejects.toMatchObject({
      category: "invalid-response",
      upstreamStatus: 201,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
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

function createSpotifyPlaylist() {
  return {
    id: "playlist-id",
    name: 'Na siłownię "BeatRoute"',
    external_urls: {
      spotify: "https://open.spotify.com/playlist/playlist-id",
    },
    public: false,
  };
}
