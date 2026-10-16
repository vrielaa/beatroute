import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpRequestExecutionError,
  HttpResponseError,
  createHttpRequestExecutor,
} from "./request-policy.js";
import {
  createRequestScheduler,
  RequestSchedulerPausedError,
} from "./request-scheduler.js";

describe("HTTP request policy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, "3"])(
    "returns a successful response without waiting or pausing for Retry-After %s",
    async (retryAfter) => {
      const response = new Response(null, {
        status: 200,
        headers:
          retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const sleep = vi.fn(async () => undefined);
      const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
      const pauseSpy = vi.spyOn(scheduler, "pauseFor");
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        sleep,
        scheduler,
      });

      await expect(request("https://api.test/resource")).resolves.toBe(
        response
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/resource",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(sleep).not.toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
    }
  );

  it("retries a safe read after a temporary HTTP failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
    });

    const response = await request("https://api.test/resource");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("passes every retry attempt through the scheduler", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
      sleep: vi.fn(async () => undefined),
    });

    await expect(request("https://api.test/resource")).resolves.toMatchObject({
      status: 200,
    });
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts the request timeout after leaving the scheduler queue", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const blockingRequest = createDeferredPromise<void>();
    const blockingResult = scheduler.schedule(() => blockingRequest.promise);
    const response = new Response(null, { status: 200 });
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw init.signal.reason;
        }

        return response;
      }
    );
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
      policy: { timeoutMs: 5, maxAttempts: 1 },
    });

    const result = request("https://api.test/resource");

    await waitFor(15);
    expect(fetchMock).not.toHaveBeenCalled();

    blockingRequest.resolve();
    await blockingResult;

    await expect(result).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not fetch a request aborted while waiting in the scheduler queue", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const blockingRequest = createDeferredPromise<void>();
    const blockingResult = scheduler.schedule(() => blockingRequest.promise);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
      })
    );
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
    });
    const controller = new AbortController();
    const result = request("https://api.test/resource", {
      signal: controller.signal,
    });

    controller.abort();

    await expect(result).rejects.toMatchObject({ kind: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();

    blockingRequest.resolve();
    await blockingResult;
  });

  it.each(["GET", "POST"])(
    "preserves a scheduler pause error without fetching or retrying %s",
    async (method) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const scheduler = createRequestScheduler({
        maxConcurrentRequests: 1,
        pauseBehavior: "reject",
      });
      const scheduleSpy = vi.spyOn(scheduler, "schedule");
      const fetchMock = vi.fn();
      const sleep = vi.fn(async () => undefined);
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        scheduler,
        sleep,
        policy: { maxAttempts: 3 },
      });

      scheduler.pauseFor(62_976_000);
      const result = request("https://api.test/resource", { method });

      await expect(result).rejects.toBeInstanceOf(RequestSchedulerPausedError);
      await expect(result).rejects.toMatchObject({
        remainingPauseMs: 62_976_000,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sleep).not.toHaveBeenCalled();
      expect(scheduleSpy).toHaveBeenCalledOnce();
    }
  );

  it("does not retry an HTTP request rejected while waiting in the scheduler queue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const activeRequest = createDeferredPromise<void>();
    const activeResult = scheduler.schedule(() => activeRequest.promise);
    const fetchMock = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
      sleep,
      policy: { maxAttempts: 3 },
    });
    const result = request("https://api.test/resource");
    const rejection = expect(result).rejects.toBeInstanceOf(
      RequestSchedulerPausedError
    );

    await Promise.resolve();
    scheduler.pauseFor(5_000);

    await rejection;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();

    activeRequest.resolve();
    await activeResult;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Retry-After expressed in seconds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "3" },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({ fetchImpl: fetchMock, sleep });

    await request("https://api.test/resource");

    expect(sleep).toHaveBeenCalledWith(3_000);
  });

  it("uses Retry-After expressed as an HTTP date", async () => {
    const currentTimeMs = Date.parse("2026-10-06T08:00:00.000Z");
    const retryDate = new Date(currentTimeMs + 5_000).toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { "Retry-After": retryDate },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      now: () => currentTimeMs,
    });

    await request("https://api.test/resource");

    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  it.each([
    ["zero", "0"],
    ["missing", undefined],
    ["invalid", "not-a-delay"],
    ["expired HTTP date", "Fri, 16 Oct 2026 08:00:00 GMT"],
  ])(
    "uses increasing backoff for a %s Retry-After",
    async (_label, retryAfter) => {
      const rateLimitedResponse = new Response(null, {
        status: 429,
        headers:
          retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      const sleep = vi.fn(async () => undefined);
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        sleep,
        now: () => Date.parse("2026-10-16T09:00:00.000Z"),
      });

      await expect(request("https://api.test/resource")).resolves.toMatchObject(
        { status: 200 }
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[500], [1_000]]);
    }
  );

  it("does not let a positive Retry-After shorten increasing backoff", async () => {
    const rateLimitedResponse = new Response(null, {
      status: 429,
      headers: { "Retry-After": "1" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { baseRetryDelayMs: 750 },
    });

    await expect(request("https://api.test/resource")).resolves.toMatchObject({
      status: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1_000], [1_500]]);
  });

  it.each([
    ["zero", "0"],
    ["missing", undefined],
    ["invalid", "not-a-delay"],
    ["expired HTTP date", "Thu, 01 Jan 1970 00:00:00 GMT"],
  ])(
    "pauses the scheduler after a final 429 with a %s Retry-After",
    async (_label, retryAfter) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const response = new Response(null, {
        status: 429,
        headers:
          retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        scheduler,
        policy: { maxAttempts: 1 },
      });

      await expect(request("https://api.test/resource")).resolves.toBe(
        response
      );

      const nextOperation = vi.fn(async () => "done");
      const nextResult = scheduler.schedule(nextOperation);

      await vi.advanceTimersByTimeAsync(499);
      expect(nextOperation).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(nextResult).resolves.toBe("done");
      expect(nextOperation).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("shares increasing delay between retries and scheduler pauses including the final 429", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const response = new Response(null, { status: 429 });
    const startTimes: number[] = [];
    const fetchMock = vi.fn(async () => {
      startTimes.push(Date.now());
      return response;
    });
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const pauseSpy = vi.spyOn(scheduler, "pauseFor");
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
    });

    const result = request("https://api.test/resource");
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(result).resolves.toBe(response);
    expect(startTimes).toEqual([0, 500, 1_500]);
    expect(pauseSpy.mock.calls.map(([delayMs]) => delayMs)).toEqual([
      500, 1_000, 2_000,
    ]);

    const nextOperation = vi.fn(async () => "done");
    const nextResult = scheduler.schedule(nextOperation);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(nextOperation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(nextResult).resolves.toBe("done");
    expect(nextOperation).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [400, undefined, false],
    [400, "not-a-delay", false],
    [400, "0", true],
    [503, undefined, false],
  ])(
    "pauses after HTTP %i and Retry-After %s only when appropriate",
    async (status, retryAfter, shouldPause) => {
      const response = new Response(null, {
        status,
        headers:
          retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
      const pauseSpy = vi.spyOn(scheduler, "pauseFor");
      const sleep = vi.fn(async () => undefined);
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        scheduler,
        sleep,
        policy: { maxAttempts: 1 },
      });

      await expect(request("https://api.test/resource")).resolves.toBe(
        response
      );

      if (shouldPause) {
        expect(pauseSpy).toHaveBeenCalledWith(500, {
          cause: expect.any(HttpResponseError),
        });
      } else {
        expect(pauseSpy).not.toHaveBeenCalled();
      }
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    }
  );

  it("pauses the scheduler after a failed response with Retry-After", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "3" },
      })
    );
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
      policy: { maxAttempts: 1 },
      now: () => Date.now(),
    });

    await expect(request("https://api.test/resource")).resolves.toMatchObject({
      status: 429,
    });

    const nextOperation = vi.fn(async () => "done");
    const nextResult = scheduler.schedule(nextOperation);

    await Promise.resolve();
    expect(nextOperation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_999);
    expect(nextOperation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(nextResult).resolves.toBe("done");
    expect(nextOperation).toHaveBeenCalledOnce();
  });

  it("does not retry earlier than a Retry-After exceeding the allowed delay", async () => {
    const response = new Response(null, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn(async () => undefined);
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const pauseSpy = vi.spyOn(scheduler, "pauseFor");
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      scheduler,
      policy: { maxRetryDelayMs: 30_000 },
    });

    await expect(request("https://api.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(pauseSpy).toHaveBeenCalledWith(60_000, {
      cause: expect.objectContaining({ status: 429 }),
    });
  });

  it("returns the final retryable response after exhausting all attempts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { maxAttempts: 2 },
    });

    const response = await request("https://api.test/resource");

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it.each([429, 502, 503, 504])(
    "does not retry a POST request after HTTP %i",
    async (status) => {
      const response = new Response(null, { status });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const sleep = vi.fn(async () => undefined);
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        sleep,
        policy: { maxAttempts: 3 },
      });

      await expect(
        request("https://api.test/resource", { method: "POST" })
      ).resolves.toBe(response);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    }
  );

  it("preserves POST headers and body when using the scheduler", async () => {
    const response = new Response(null, { status: 201 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const controller = new AbortController();
    const headers = {
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    };
    const body = JSON.stringify({ name: "My playlist", public: false });
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      scheduler,
    });

    await expect(
      request("https://api.test/resource", {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      })
    ).resolves.toBe(response);

    expect(scheduleSpy).toHaveBeenCalledOnce();
    expect(scheduleSpy).toHaveBeenCalledWith(expect.any(Function), {
      signal: controller.signal,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/resource",
      expect.objectContaining({
        method: "POST",
        headers,
        body,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it.each([
    [undefined, 500],
    ["0", 500],
    ["not-a-delay", 500],
    ["3", 3_000],
  ])(
    "pauses on a POST 429 with Retry-After %s without retrying the write",
    async (retryAfter, delayMs) => {
      const response = new Response(null, {
        status: 429,
        headers:
          retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const sleep = vi.fn(async () => undefined);
      const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
      const scheduleSpy = vi.spyOn(scheduler, "schedule");
      const pauseSpy = vi.spyOn(scheduler, "pauseFor");
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        sleep,
        scheduler,
        policy: { maxAttempts: 3 },
      });

      await expect(
        request("https://api.test/resource", { method: "POST" })
      ).resolves.toBe(response);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(scheduleSpy).toHaveBeenCalledOnce();
      expect(pauseSpy).toHaveBeenCalledWith(delayMs, {
        cause: expect.objectContaining({ status: 429 }),
      });
      expect(sleep).not.toHaveBeenCalled();
    }
  );

  it.each([429, 503])(
    "preserves HTTP %s as the cause of a scheduler pause",
    async (status) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const response = new Response("private-response-data", {
        status,
        headers: { "Retry-After": "60" },
      });
      const fetchMock = vi.fn().mockResolvedValue(response);
      const scheduler = createRequestScheduler({
        maxConcurrentRequests: 1,
        pauseBehavior: "reject",
      });
      const request = createHttpRequestExecutor({
        fetchImpl: fetchMock,
        scheduler,
      });

      await expect(request("https://api.test/resource")).resolves.toBe(
        response
      );

      const result = request("https://api.test/another-resource");
      await expect(result).rejects.toMatchObject({
        remainingPauseMs: 60_000,
        cause: expect.any(HttpResponseError),
      });
      await expect(result).rejects.toMatchObject({ cause: { status } });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("does not retry a POST request after a network failure", async () => {
    const connectionError = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(connectionError);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { maxAttempts: 3 },
    });

    const result = request("https://api.test/resource", { method: "POST" });

    await expect(result).rejects.toBeInstanceOf(HttpRequestExecutionError);
    await expect(result).rejects.toMatchObject({
      kind: "network",
      originalCause: connectionError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry a POST request after a timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { maxAttempts: 3 },
    });

    await expect(
      request("https://api.test/resource", { method: "POST" })
    ).rejects.toMatchObject({
      kind: "timeout",
      originalCause: timeoutError,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a network failure and exposes it after the final attempt", async () => {
    const connectionError = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(connectionError);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { maxAttempts: 2 },
    });

    const result = request("https://api.test/resource");

    await expect(result).rejects.toBeInstanceOf(HttpRequestExecutionError);
    await expect(result).rejects.toMatchObject({
      kind: "network",
      originalCause: connectionError,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("classifies an exhausted timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const request = createHttpRequestExecutor({
      fetchImpl: vi.fn().mockRejectedValue(timeoutError),
      policy: { maxAttempts: 1 },
    });

    await expect(request("https://api.test/resource")).rejects.toMatchObject({
      kind: "timeout",
      originalCause: timeoutError,
    });
  });

  it.each([
    [{ timeoutMs: 0 }, "timeout"],
    [{ maxAttempts: 0 }, "max attempts"],
    [{ baseRetryDelayMs: -1 }, "retry delay"],
    [{ baseRetryDelayMs: 1_000, maxRetryDelayMs: 500 }, "maximum retry delay"],
  ])("rejects an invalid policy %o", (policy, expectedMessage) => {
    expect(() => createHttpRequestExecutor({ policy })).toThrowError(
      expectedMessage
    );
  });
});

/**
 * Reprezentuje ręcznie sterowany Promise używany do blokowania schedulera.
 *
 * @property promise - Promise oczekujący na ręczne zakończenie.
 * @property resolve - Kończy Promise bez wyniku.
 */
type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
