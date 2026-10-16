import { afterEach, describe, expect, it, vi } from "vitest";

import { ReccoBeatsApiError } from "./reccobeats-api.error.js";
import { createReccoBeatsGateway } from "./reccobeats.gateway.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";
import { HttpResponseError } from "@integrations/request-policy.js";

describe("ReccoBeats gateway", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts the real search response with trackTitle rather than name", async () => {
    const track = {
      id: "bf5bbe91-ad19-4fab-bc0f-bd1e41ef9c13",
      trackTitle: "Bound 2",
      href: "https://open.spotify.com/track/3sNVsP50132BTNlImLx70i",
      durationMs: 229146,
      artists: [{ name: "Kanye West" }],
    };
    const gateway = createGateway(
      vi.fn().mockResolvedValue(jsonResponse({ content: [track] }))
    );
    await expect(
      gateway.findTracksBySpotifyIds(["3sNVsP50132BTNlImLx70i"])
    ).resolves.toEqual([track]);
  });

  it("only requires the ID and Spotify link used to associate results", async () => {
    const track = {
      id: "recco-1",
      href: "https://open.spotify.com/track/spotify1",
    };
    const gateway = createGateway(
      vi.fn().mockResolvedValue(jsonResponse({ content: [track] }))
    );
    await expect(gateway.findTracksBySpotifyIds(["spotify1"])).resolves.toEqual(
      [track]
    );
  });
  it.each([
    null,
    "unexpected",
    { content: null },
    { error: "not a result" },
    [null],
    [{ id: "one" }],
  ])(
    "does not treat a malformed search response as missing tracks: %j",
    async (data) => {
      const gateway = createGateway(
        vi.fn().mockResolvedValue(jsonResponse(data))
      );
      await expect(
        gateway.findTracksBySpotifyIds(["spotify1"])
      ).rejects.toMatchObject({ category: "invalid-response", data: null });
    }
  );

  it.each([null, [], "unexpected", {}, { tempo: "120" }, { energy: false }])(
    "does not treat invalid audio data as a missing measurement: %j",
    async (data) => {
      const gateway = createGateway(
        vi.fn().mockResolvedValue(jsonResponse(data))
      );
      await expect(gateway.getTrackAudioFeatures("one")).rejects.toMatchObject({
        category: "invalid-response",
        data: null,
      });
    }
  );

  it("accepts null and zero measurements as valid incomplete data", async () => {
    const gateway = createGateway(
      vi.fn().mockResolvedValue(jsonResponse({ tempo: null, energy: 0 }))
    );
    await expect(gateway.getTrackAudioFeatures("one")).resolves.toEqual({
      tempo: null,
      energy: 0,
    });
  });
  it("searches for every Spotify ID using repeated query parameters", async () => {
    const responseBody = [
      {
        id: "recco-1",
        href: "https://open.spotify.com/track/spotify1",
        trackTitle: "Track 1",
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const gateway = createGateway(fetchMock);

    await expect(
      gateway.findTracksBySpotifyIds(["spotify/id", "second id"])
    ).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reccobeats.test/v1/track?ids=spotify%2Fid&ids=second+id",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it.each([
    ["content", { content: [createTrack()] }],
    ["items", { items: [createTrack()] }],
    ["object array", { object: [createTrack()] }],
    ["nested object items", { object: { items: [createTrack()] } }],
  ])("normalizes tracks from the %s response variant", async (_, body) => {
    const gateway = createGateway(
      vi.fn().mockResolvedValue(jsonResponse(body))
    );

    await expect(gateway.findTracksBySpotifyIds(["spotify1"])).resolves.toEqual(
      [createTrack()]
    );
  });

  it("returns an empty list for a response without tracks", async () => {
    const gateway = createGateway(vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(gateway.findTracksBySpotifyIds(["missing"])).resolves.toEqual(
      []
    );
  });

  it("fetches audio features using an encoded ReccoBeats ID", async () => {
    const responseBody = { tempo: 128, energy: 0.81 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const gateway = createGateway(fetchMock);

    await expect(gateway.getTrackAudioFeatures("recco/id")).resolves.toEqual(
      responseBody
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reccobeats.test/v1/track/recco%2Fid/audio-features",
      expect.any(Object)
    );
  });

  it("routes requests through an injected scheduler", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const gateway = createReccoBeatsGateway({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse([createTrack()])),
      baseUrl: "https://reccobeats.test",
      scheduler,
    });

    await gateway.findTracksBySpotifyIds(["spotify1"]);

    expect(scheduleSpy).toHaveBeenCalledOnce();
  });

  it("throws ReccoBeatsApiError containing status and response data", async () => {
    const errorData = { message: "Cloudflare tunnel unavailable" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorData, { status: 530 }));
    const gateway = createGateway(fetchMock);

    const request = gateway.findTracksBySpotifyIds(["spotify1"]);

    await expect(request).rejects.toBeInstanceOf(ReccoBeatsApiError);
    await expect(request).rejects.toMatchObject({
      message: "Nie udało się pobrać danych z ReccoBeats",
      status: 530,
      data: errorData,
    });
  });

  it.each([
    { status: 429, category: "rate-limited" },
    { status: 503, category: "unavailable" },
  ])(
    "preserves the cause of a local $status pause without a new upstream status",
    async ({ status, category }) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const scheduler = createRequestScheduler({
        maxConcurrentRequests: 1,
        pauseBehavior: "reject",
      });
      scheduler.pauseFor(2_500, { cause: new HttpResponseError(status) });
      const fetchMock = vi.fn<typeof fetch>();
      const gateway = createReccoBeatsGateway({
        fetchImpl: fetchMock,
        baseUrl: "https://reccobeats.test",
        scheduler,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const result = gateway.getTrackAudioFeatures("recco-1");

      await expect(result).rejects.toBeInstanceOf(ReccoBeatsApiError);
      await expect(result).rejects.toMatchObject({
        category,
        status,
        upstreamStatus: null,
        retryAfterSeconds: 2,
        data: null,
        details: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("maps a local pause without an HTTP cause to service unavailability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    scheduler.pauseFor(1_000);
    const fetchMock = vi.fn<typeof fetch>();
    const gateway = createReccoBeatsGateway({
      fetchImpl: fetchMock,
      baseUrl: "https://reccobeats.test",
      scheduler,
    });

    await expect(
      gateway.findTracksBySpotifyIds(["spotify1"])
    ).rejects.toMatchObject({
      category: "unavailable",
      status: 503,
      upstreamStatus: null,
      retryAfterSeconds: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps HTTP 429 rate-limited even when the response is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": "10" },
      })
    );
    const gateway = createGateway(fetchMock);

    await expect(
      gateway.getTrackAudioFeatures("recco-1")
    ).rejects.toMatchObject({
      category: "rate-limited",
      status: 429,
      upstreamStatus: 429,
      retryAfterSeconds: 10,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

function createGateway(fetchImpl: typeof fetch) {
  return createReccoBeatsGateway({
    fetchImpl,
    baseUrl: "https://reccobeats.test",
  });
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createTrack() {
  return {
    id: "recco-1",
    href: "https://open.spotify.com/track/spotify1",
    trackTitle: "Track 1",
  };
}
