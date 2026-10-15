import { describe, expect, it, vi } from "vitest";
import { createRequestScheduler } from "@integrations/request-scheduler.js";
import { SpotifyApiError } from "./spotify-api.error.js";
import { createSpotifyGateway } from "./spotify.gateway.js";
import type {
  SpotifyLibraryTrack,
  SpotifySavedTrackApiResponse,
  SpotifySavedTracksApiResponse,
} from "./spotify.types.js";

describe("Spotify saved tracks", () => {
  it.each([
    { limit: 1, offset: 0 },
    { limit: 25, offset: 25 },
    { limit: 50, offset: 50 },
  ])("fetches exactly one requested page: %j", async (selection) => {
    const page = createPage({
      ...selection,
      total: selection.offset + 1,
      previous:
        selection.offset === 0
          ? null
          : "https://spotify.test/v1/me/tracks?offset=0",
    });
    const { gateway, fetchImpl } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("user-token", selection)
    ).resolves.toEqual(page);

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      `https://spotify.test/v1/me/tracks?limit=${selection.limit}&offset=${selection.offset}`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer user-token" },
        body: undefined,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("preserves the first page without following its next URL", async () => {
    const page = createPage({
      total: 100,
      next: "https://untrusted.test/next-page",
      previous: null,
    });
    const { gateway, fetchImpl } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://spotify.test/v1/me/tracks?limit=50&offset=0"
    );
  });

  it("accepts an empty library with nullable pagination links", async () => {
    const page = createPage({ items: [], total: 0 });
    const { gateway } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);
  });

  it("preserves wrappers, dates, order, duplicates and unavailable tracks", async () => {
    const sourceTrack = {
      ...createTrack({
        name: "  Original title  ",
        artists: [{ name: " Original artist " }, { name: "Other artist" }],
        is_local: true,
        is_playable: false,
      }),
      album: { providerField: "not required by this contract" },
    };
    const firstItem = createItem({ track: sourceTrack });
    const missingItem = createItem({
      added_at: "2026-10-14T08:00:00Z",
      track: null,
    });
    const page = createPage({
      items: [firstItem, missingItem, firstItem],
      total: 3,
    });
    const { gateway, fetchImpl } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("leaves empty metadata and text dates to subsequent processing", async () => {
    const page = createPage({
      items: [
        createItem({
          added_at: "date text not parsed by this gateway",
          track: createTrack({ id: "", name: "", artists: [] }),
        }),
      ],
    });
    const { gateway } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);
  });

  it.each([
    {},
    { is_local: false, is_playable: true },
    { is_local: true, is_playable: false },
  ])("accepts omitted or boolean availability flags: %j", async (flags) => {
    const page = createPage({
      items: [createItem({ track: createTrack(flags) })],
    });
    const { gateway } = createGatewayWithPage(page);

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);
  });

  it.each([null, [], "page", 1, {}])(
    "rejects an invalid response container: %j",
    async (body) => {
      await expectInvalidPage(body);
    }
  );

  it.each([
    { field: "items", value: undefined },
    { field: "items", value: null },
    { field: "items", value: {} },
    { field: "total", value: undefined },
    { field: "total", value: "1" },
    { field: "total", value: -1 },
    { field: "total", value: 1.5 },
    { field: "total", value: Number.MAX_SAFE_INTEGER + 1 },
    { field: "limit", value: "50" },
    { field: "limit", value: 25 },
    { field: "offset", value: "0" },
    { field: "offset", value: 1 },
    { field: "href", value: null },
    { field: "href", value: 123 },
    { field: "next", value: undefined },
    { field: "next", value: false },
    { field: "previous", value: undefined },
    { field: "previous", value: 123 },
  ])("rejects invalid page field $field=$value", async ({ field, value }) => {
    await expectInvalidPage({ ...createPage(), [field]: value });
  });

  it("rejects an empty page while positions remain available", async () => {
    await expectInvalidPage(createPage({ items: [], total: 1 }));
  });

  it("rejects a page containing more positions than the requested limit", async () => {
    await expectInvalidPage(
      createPage({
        items: Array.from({ length: 51 }, () => createItem()),
        total: 51,
      })
    );
  });

  it("rejects positions extending beyond the reported total", async () => {
    await expectInvalidPage(createPage({ total: 0 }));
  });

  it.each([
    null,
    [],
    "item",
    {},
    { added_at: "2026-10-15T08:00:00Z" },
    { track: null },
    { added_at: null, track: null },
    { added_at: 123, track: null },
    { added_at: "2026-10-15T08:00:00Z", track: [] },
    { added_at: "2026-10-15T08:00:00Z", track: "track" },
    { added_at: "2026-10-15T08:00:00Z", track: {} },
  ])("rejects an invalid saved item: %j", async (item) => {
    await expectInvalidPage({ ...createPage(), items: [item] });
  });

  it.each([
    { field: "id", value: undefined },
    { field: "id", value: 123 },
    { field: "id", value: null },
    { field: "name", value: undefined },
    { field: "name", value: false },
    { field: "artists", value: undefined },
    { field: "artists", value: "artist" },
    { field: "artists", value: [null] },
    { field: "artists", value: [[]] },
    { field: "artists", value: [{}] },
    { field: "artists", value: [{ name: 123 }] },
    { field: "is_local", value: null },
    { field: "is_local", value: "false" },
    { field: "is_playable", value: null },
    { field: "is_playable", value: 1 },
  ])("rejects invalid track field $field=$value", async ({ field, value }) => {
    const item = {
      ...createItem(),
      track: { ...createTrack(), [field]: value },
    };
    await expectInvalidPage({ ...createPage(), items: [item] });
  });

  it("does not retain a malformed successful response in error diagnostics", async () => {
    const { gateway } = createGatewayWithPage({
      ...createPage(),
      items: [{ added_at: "2026-10-15T08:00:00Z", track: {} }],
      privateData: "secret-response-marker",
    });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).rejects.toMatchObject({
      message: "Spotify zwróciło niepoprawną odpowiedź zapisanych utworów",
      category: "invalid-response",
      data: null,
      details: null,
    });
  });

  it.each([
    { status: 401, category: "authentication" },
    { status: 403, category: "authorization" },
    { status: 429, category: "rate-limited" },
    { status: 503, category: "unavailable" },
  ])("preserves an upstream $status error", async ({ status, category }) => {
    const data = { error: { message: "Spotify request rejected" } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(data, {
        status,
        headers: { "Retry-After": "30" },
      })
    );
    const gateway = createSpotifyGateway({
      fetchImpl,
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).rejects.toMatchObject({
      name: "SpotifyApiError",
      category,
      upstreamStatus: status,
      retryAfterSeconds: 30,
      data,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not automatically retry a 429 response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "Too many requests" } },
          { status: 429, headers: { "Retry-After": "30" } }
        )
      );
    const gateway = createSpotifyGateway({ fetchImpl });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).rejects.toMatchObject({
      category: "rate-limited",
      retryAfterSeconds: 30,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("schedules every attempt when retrying a temporary GET failure", async () => {
    const page = createPage();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(page));
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const schedule = vi.spyOn(scheduler, "schedule");
    const gateway = createSpotifyGateway({
      fetchImpl,
      scheduler,
      requestPolicy: { maxAttempts: 2, baseRetryDelayMs: 0 },
    });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).resolves.toEqual(page);

    expect(schedule).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe(
        "https://api.spotify.com/v1/me/tracks?limit=50&offset=0"
      );
      expect(init).toMatchObject({
        method: "GET",
        signal: expect.any(AbortSignal),
      });
    }
  });

  it.each([
    { name: "TypeError", category: "network", status: 502 },
    { name: "TimeoutError", category: "timeout", status: 504 },
  ])("maps a $name transport failure", async ({ name, category, status }) => {
    const cause = new Error("transport failure");
    cause.name = name;
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(cause);
    const gateway = createSpotifyGateway({
      fetchImpl,
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).rejects.toMatchObject({ category, status, data: cause });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a non-JSON response without repeating the request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not JSON"));
    const gateway = createSpotifyGateway({ fetchImpl });

    await expect(
      gateway.getCurrentUserSavedTracks("token", { limit: 50, offset: 0 })
    ).rejects.toMatchObject({
      category: "invalid-response",
      upstreamStatus: 200,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

async function expectInvalidPage(body: unknown): Promise<void> {
  const { gateway, fetchImpl } = createGatewayWithPage(body);
  const result = gateway.getCurrentUserSavedTracks("token", {
    limit: 50,
    offset: 0,
  });

  await expect(result).rejects.toBeInstanceOf(SpotifyApiError);
  await expect(result).rejects.toMatchObject({
    category: "invalid-response",
    upstreamStatus: 200,
    data: null,
    details: null,
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
}

function createGatewayWithPage(body: unknown) {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body));
  const gateway = createSpotifyGateway({
    fetchImpl,
    apiRoot: "https://spotify.test/v1",
    requestPolicy: { maxAttempts: 1 },
  });
  return { gateway, fetchImpl };
}

function createPage(
  overrides: Partial<SpotifySavedTracksApiResponse> = {}
): SpotifySavedTracksApiResponse {
  const limit = overrides.limit ?? 50;
  const offset = overrides.offset ?? 0;
  return {
    href: `https://spotify.test/v1/me/tracks?limit=${limit}&offset=${offset}`,
    items: [createItem()],
    total: 1,
    limit,
    offset,
    next: null,
    previous: null,
    ...overrides,
  };
}

function createItem(
  overrides: Partial<SpotifySavedTrackApiResponse> = {}
): SpotifySavedTrackApiResponse {
  return {
    added_at: "2026-10-15T08:00:00Z",
    track: createTrack(),
    ...overrides,
  };
}

function createTrack(
  overrides: Partial<SpotifyLibraryTrack> = {}
): SpotifyLibraryTrack {
  return {
    id: "3sNVsP50132BTNlImLx70i",
    name: "Example track",
    artists: [{ name: "Example artist" }],
    ...overrides,
  };
}
