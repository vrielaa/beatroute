import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";

describe("production ReccoBeats request policy", () => {
  let gateway: ReccoBeatsGateway;
  let fetchMock = vi.fn<typeof fetch>();
  const tracks = [
    { id: "recco-1", href: "https://open.spotify.com/track/spotify1" },
  ];
  const audioFeatures = { tempo: 128, energy: 0.8 };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
    fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        jsonResponse(
          String(url).endsWith("/audio-features")
            ? audioFeatures
            : { content: tracks }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    gateway = (await import("./reccobeats.gateway.js"))
      .defaultReccoBeatsGateway;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares one request per second between searches and audio feature reads", async () => {
    const startTimes: number[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockImplementation(async (url) => {
      startTimes.push(Date.now());
      return jsonResponse(
        String(url).endsWith("/audio-features")
          ? audioFeatures
          : { content: tracks }
      );
    });
    const results = Promise.all([
      gateway.findTracksBySpotifyIds(["spotify1"]),
      gateway.getTrackAudioFeatures("recco-1"),
      gateway.findTracksBySpotifyIds(["spotify2"]),
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
    await expect(results).resolves.toEqual([tracks, audioFeatures, tracks]);
    expect(startTimes).toEqual([0, 1_000, 2_000]);
    expect(timeoutSpy).toHaveBeenCalledTimes(3);
  });

  it.each([502, 503, 504])(
    "retries HTTP %i with backoff starting at one second",
    async (status) => {
      const startTimes: number[] = [];
      fetchMock.mockImplementation(async () => {
        startTimes.push(Date.now());
        return startTimes.length <= 2
          ? jsonResponse({ message: "Unavailable" }, status)
          : jsonResponse(audioFeatures);
      });
      const result = gateway.getTrackAudioFeatures("recco-1");

      await vi.advanceTimersByTimeAsync(0);
      expect(startTimes).toEqual([0]);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      expect(startTimes).toEqual([0, 1_000]);

      await vi.advanceTimersByTimeAsync(1_999);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual(audioFeatures);
      expect(startTimes).toEqual([0, 1_000, 3_000]);
    }
  );

  it("counts retry attempts against the same rate limit as other gateway operations", async () => {
    const startTimes: number[] = [];
    fetchMock.mockImplementation(async (url) => {
      startTimes.push(Date.now());
      if (startTimes.length === 1) {
        return jsonResponse({ message: "Unavailable" }, 503);
      }
      return jsonResponse(
        String(url).endsWith("/audio-features")
          ? audioFeatures
          : { content: tracks }
      );
    });
    const results = Promise.all([
      gateway.findTracksBySpotifyIds(["spotify1"]),
      gateway.getTrackAudioFeatures("recco-1"),
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(startTimes).toEqual([0, 1_000]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/audio-features");

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(results).resolves.toEqual([tracks, audioFeatures]);
    expect(startTimes).toEqual([0, 1_000, 2_000]);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/v1/track?");
  });

  it.each([
    {
      label: "missing",
      header: undefined,
      upstreamRetry: null,
      pauseMs: 1_000,
    },
    { label: "zero", header: "0", upstreamRetry: 0, pauseMs: 1_000 },
    {
      label: "invalid",
      header: "not-a-delay",
      upstreamRetry: null,
      pauseMs: 1_000,
    },
    { label: "positive", header: "10", upstreamRetry: 10, pauseMs: 10_000 },
  ])(
    "rejects queued and new operations after a 429 with $label Retry-After, without retrying",
    async ({ header, upstreamRetry, pauseMs }) => {
      const errorData = { status: 4291, message: "Too many requests" };
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          errorData,
          429,
          header === undefined ? {} : { "Retry-After": header }
        )
      );
      const firstResult = gateway.findTracksBySpotifyIds(["spotify1"]);
      const queuedAudio = gateway.getTrackAudioFeatures("recco-1");
      const queuedSearch = gateway.findTracksBySpotifyIds(["spotify2"]);
      const rejections = Promise.all([
        expect(firstResult).rejects.toMatchObject({
          name: "ReccoBeatsApiError",
          category: "rate-limited",
          status: 429,
          upstreamStatus: 429,
          retryAfterSeconds: upstreamRetry,
          data: errorData,
        }),
        ...[queuedAudio, queuedSearch].map((result) =>
          expect(result).rejects.toMatchObject({
            name: "ReccoBeatsApiError",
            category: "rate-limited",
            status: 429,
            upstreamStatus: null,
            retryAfterSeconds: pauseMs / 1_000,
            data: null,
          })
        ),
      ]);

      await vi.advanceTimersByTimeAsync(0);
      await rejections;
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(pauseMs - 1);
      await expect(
        gateway.getTrackAudioFeatures("still-paused")
      ).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
        retryAfterSeconds: 1,
      });
      expect(fetchMock).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledOnce();
      await expect(gateway.getTrackAudioFeatures("recco-1")).resolves.toEqual(
        audioFeatures
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

  it("allows an already-started operation to finish after another request triggers a pause", async () => {
    const completeRequests: ((response: Response) => void)[] = [];
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => completeRequests.push(resolve))
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: "Too many requests" }, 429, {
          "Retry-After": "10",
        })
      );
    const activeResult = gateway.getTrackAudioFeatures("already-running");
    const limitedResult = gateway.findTracksBySpotifyIds(["spotify1"]);
    const queuedResult = gateway.getTrackAudioFeatures("queued");
    const rejections = Promise.all([
      expect(limitedResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: 429,
      }),
      expect(queuedResult).rejects.toMatchObject({
        category: "rate-limited",
        upstreamStatus: null,
      }),
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    await rejections;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    completeRequests[0](jsonResponse(audioFeatures));
    await expect(activeResult).resolves.toEqual(audioFeatures);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps at most five requests running even when another rate slot is available", async () => {
    const completeRequests: ((response: Response) => void)[] = [];
    const startTimes: number[] = [];
    fetchMock.mockImplementation(() => {
      startTimes.push(Date.now());
      return new Promise<Response>((resolve) => completeRequests.push(resolve));
    });
    const results = Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        gateway.getTrackAudioFeatures(`recco-${index}`)
      )
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(startTimes).toEqual([0, 1_000, 2_000, 3_000, 4_000]);

    completeRequests[0](jsonResponse(audioFeatures));
    await vi.advanceTimersByTimeAsync(0);
    expect(startTimes).toEqual([0, 1_000, 2_000, 3_000, 4_000, 5_000]);

    for (const complete of completeRequests.slice(1)) {
      complete(jsonResponse(audioFeatures));
    }

    await expect(results).resolves.toEqual(
      Array.from({ length: 6 }, () => audioFeatures)
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
