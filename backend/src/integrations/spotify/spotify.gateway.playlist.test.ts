import { describe, expect, it, vi } from "vitest";
import { createSpotifyGateway } from "./spotify.gateway.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

describe("Spotify playlist contents", () => {
  it("reads all pages in order, checks the snapshot and never writes", async () => {
    const ids = Array.from({ length: 132 }, (_, index) =>
      String(index).padStart(22, "0")
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(pageResponse(ids.slice(0, 50), 0, 132))
      .mockResolvedValueOnce(pageResponse(ids.slice(50, 100), 50, 132))
      .mockResolvedValueOnce(pageResponse(ids.slice(100), 100, 132))
      .mockResolvedValueOnce(snapshotResponse());
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const schedule = vi.spyOn(scheduler, "schedule");
    const gateway = createSpotifyGateway({
      fetchImpl,
      apiRoot: "https://spotify.test/v1",
      scheduler,
    });

    await expect(
      gateway.getPlaylistContents("token", "playlist/id")
    ).resolves.toEqual({
      trackIds: ids,
      snapshotId: "snapshot-1",
    });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://spotify.test/v1/playlists/playlist%2Fid?fields=snapshot_id",
      "https://spotify.test/v1/playlists/playlist%2Fid/items?limit=50&offset=0",
      "https://spotify.test/v1/playlists/playlist%2Fid/items?limit=50&offset=50",
      "https://spotify.test/v1/playlists/playlist%2Fid/items?limit=50&offset=100",
      "https://spotify.test/v1/playlists/playlist%2Fid?fields=snapshot_id",
    ]);
    expect(schedule).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        headers: { Authorization: "Bearer token" },
        signal: expect.any(AbortSignal),
      });
      expect(init?.body).toBeUndefined();
    }
  });

  it("supports an empty playlist", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(pageResponse([], 0, 0))
      .mockResolvedValueOnce(snapshotResponse());

    await expect(
      createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
    ).resolves.toEqual({ trackIds: [], snapshotId: "snapshot-1" });
  });

  it("preserves unknown positions and uses the original ID of a relinked track", async () => {
    const originalId = "a".repeat(22);
    const items = [
      {
        is_local: false,
        item: {
          type: "track",
          id: "b".repeat(22),
          linked_from: { id: originalId },
        },
      },
      { is_local: false, item: null },
      { is_local: true, item: { type: "track", id: "c".repeat(22) } },
      { is_local: false, item: { type: "episode", id: "d".repeat(22) } },
      { is_local: false, item: { type: "track", id: null } },
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(
        Response.json({ items, offset: 0, total: items.length })
      )
      .mockResolvedValueOnce(snapshotResponse());

    await expect(
      createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
    ).resolves.toMatchObject({
      trackIds: [originalId, null, null, null, null],
    });
  });

  it.each([
    {},
    { items: [], total: 1, offset: 0 },
    { items: [], total: 501, offset: 0 },
    { items: [], total: -1, offset: 0 },
    { items: [], total: 0, offset: 50 },
    { items: [], total: "0", offset: 0 },
    { items: [null], total: 0, offset: 0 },
  ])("rejects an incomplete or inconsistent page: %j", async (page) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(Response.json(page));

    await expect(
      createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
    ).rejects.toMatchObject({ category: "invalid-response" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects changed totals across pages instead of returning a partial list", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(pageResponse(["a".repeat(22)], 0, 2))
      .mockResolvedValueOnce(pageResponse(["b".repeat(22)], 1, 3));

    await expect(
      createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
    ).rejects.toMatchObject({ category: "invalid-response" });
  });

  it("rejects a snapshot change even if the number of tracks stayed the same", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(pageResponse(["a".repeat(22)], 0, 1))
      .mockResolvedValueOnce(snapshotResponse("snapshot-2"));

    await expect(
      createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
    ).rejects.toMatchObject({ category: "invalid-response" });
  });

  it("does not follow an external next URL", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshotResponse())
      .mockResolvedValueOnce(
        Response.json({
          items: [
            { is_local: false, item: { type: "track", id: "a".repeat(22) } },
          ],
          offset: 0,
          total: 1,
          next: "https://untrusted.test",
        })
      )
      .mockResolvedValueOnce(snapshotResponse());

    await createSpotifyGateway({ fetchImpl }).getPlaylistContents(
      "token",
      "id"
    );

    expect(
      fetchImpl.mock.calls.every(([url]) =>
        String(url).startsWith("https://api.spotify.com/v1/")
      )
    ).toBe(true);
  });

  it.each([403, 429])(
    "preserves an HTTP %i error without retrying or writing",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { message: "Denied" } },
            { status, headers: { "Retry-After": "120" } }
          )
        );

      await expect(
        createSpotifyGateway({ fetchImpl }).getPlaylistContents("token", "id")
      ).rejects.toMatchObject({ status, retryAfterSeconds: 120 });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  );
});

function snapshotResponse(snapshotId = "snapshot-1"): Response {
  return Response.json({ snapshot_id: snapshotId });
}

function pageResponse(ids: string[], offset: number, total: number): Response {
  return Response.json({
    items: ids.map((id) => ({ is_local: false, item: { type: "track", id } })),
    offset,
    total,
  });
}
