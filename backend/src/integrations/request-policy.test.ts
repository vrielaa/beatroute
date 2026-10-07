import { describe, expect, it, vi } from "vitest";
import {
  HttpRequestExecutionError,
  createHttpRequestExecutor,
} from "./request-policy.js";
import { createRequestScheduler } from "./request-scheduler.js";

describe("HTTP request policy", () => {
  it("returns the first successful response without waiting", async () => {
    const response = new Response(null, { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
    });

    await expect(request("https://api.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/resource",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(sleep).not.toHaveBeenCalled();
  });

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

  it("does not retry earlier than a Retry-After exceeding the allowed delay", async () => {
    const response = new Response(null, {
      status: 429,
      headers: { "Retry-After": "60" },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({
      fetchImpl: fetchMock,
      sleep,
      policy: { maxRetryDelayMs: 30_000 },
    });

    await expect(request("https://api.test/resource")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
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

  it("does not retry a POST request", async () => {
    const response = new Response(null, { status: 503 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn(async () => undefined);
    const request = createHttpRequestExecutor({ fetchImpl: fetchMock, sleep });

    await expect(
      request("https://api.test/resource", { method: "POST" })
    ).resolves.toBe(response);
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
