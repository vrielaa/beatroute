import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotifyGateway } from "./spotify.types.js";

describe("production Spotify gateway request rate", () => {
  let gateway: SpotifyGateway;
  let fetchMock = vi.fn<typeof fetch>();
  const profile = { id: "user-id", display_name: "User" };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    gateway = (await import("./spotify.gateway.js")).defaultSpotifyGateway;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares one request per second between different users", async () => {
    const startTimes: number[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockImplementation(async () => {
      startTimes.push(Date.now());
      return jsonResponse(profile);
    });
    const results = Promise.all([
      gateway.getCurrentUserProfile("first-user-token"),
      gateway.getCurrentUserProfile("second-user-token"),
      gateway.getCurrentUserProfile("third-user-token"),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(startTimes).toEqual([0]);
    expect(timeoutSpy).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(timeoutSpy).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(startTimes).toEqual([0, 1_000]);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(results).resolves.toEqual([profile, profile, profile]);
    expect(startTimes).toEqual([0, 1_000, 2_000]);
    expect(timeoutSpy).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.spotify.com/v1/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer second-user-token" },
      })
    );
  });

  it("counts retry attempts against the same rate limit", async () => {
    const startTimes: number[] = [];
    fetchMock.mockImplementation(async () => {
      startTimes.push(Date.now());
      return startTimes.length === 1
        ? jsonResponse({ error: { message: "Unavailable" } }, 503)
        : jsonResponse(profile);
    });
    const result = gateway.getCurrentUserProfile("access-token");

    await vi.advanceTimersByTimeAsync(0);
    expect(startTimes).toEqual([0]);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual(profile);
    expect(startTimes).toEqual([0, 1_000]);
  });

  it("shares the rate limit between reads and playlist writes", async () => {
    const startTimes: number[] = [];
    const playlist = {
      id: "playlist-id",
      name: "Playlist",
      external_urls: {
        spotify: "https://open.spotify.com/playlist/playlist-id",
      },
    };
    fetchMock.mockImplementation(async (url, init) => {
      startTimes.push(Date.now());

      if (init?.method === "GET") {
        return jsonResponse(profile);
      }

      return String(url).endsWith("/me/playlists")
        ? jsonResponse(playlist, 201)
        : jsonResponse({ snapshot_id: "snapshot-id" }, 201);
    });
    const results = Promise.all([
      gateway.getCurrentUserProfile("access-token"),
      gateway.createPlaylist("access-token", "Playlist"),
      gateway.addTracksToPlaylist("access-token", "playlist-id", ["track-id"]),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(startTimes).toEqual([0]);

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(results).resolves.toEqual([
      profile,
      playlist,
      { snapshot_id: "snapshot-id" },
    ]);
    expect(startTimes).toEqual([0, 1_000, 2_000]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.spotify.com/v1/me/playlists",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Playlist", public: false }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.spotify.com/v1/playlists/playlist-id/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ uris: ["spotify:track:track-id"] }),
      })
    );
  });

  it("rejects rate-limit queued requests when a provider cooldown starts", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Too many requests" } }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "10",
            },
          }
        )
      )
      .mockResolvedValueOnce(jsonResponse(profile));
    const firstResult = gateway.getCurrentUserProfile("first-user-token");
    const queuedResult = gateway.getCurrentUserProfile("second-user-token");
    const rejections = Promise.all([
      expect(firstResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: 429,
        retryAfterSeconds: 10,
      }),
      expect(queuedResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
        retryAfterSeconds: 10,
      }),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    await rejections;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(
      gateway.getCurrentUserProfile("second-user-token")
    ).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps at most five requests running even when new rate slots become free", async () => {
    const completeRequests: ((response: Response) => void)[] = [];
    const startTimes: number[] = [];
    fetchMock.mockImplementation(() => {
      startTimes.push(Date.now());
      return new Promise<Response>((resolve) => completeRequests.push(resolve));
    });
    const results = Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        gateway.getCurrentUserProfile(`user-token-${index}`)
      )
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(startTimes).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    completeRequests[0](jsonResponse(profile));
    await vi.advanceTimersByTimeAsync(0);
    expect(startTimes).toEqual([0, 1_000, 2_000, 3_000, 4_000, 5_000]);

    for (const complete of completeRequests.slice(1)) {
      complete(jsonResponse(profile));
    }

    await expect(results).resolves.toEqual(
      Array.from({ length: 6 }, () => profile)
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
