import { afterEach, describe, expect, it, vi } from "vitest";

import { createRequestScheduler } from "./request-scheduler.js";

describe("request scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { maxConcurrentRequests: 0 },
    { maxConcurrentRequests: -1 },
    { maxConcurrentRequests: 1.5 },
    {
      maxConcurrentRequests: 1,
      rateLimit: { maxRequests: 0, intervalMs: 1_000 },
    },
    {
      maxConcurrentRequests: 1,
      rateLimit: { maxRequests: 1, intervalMs: 0 },
    },
  ])("rejects invalid configuration: %o", (configuration) => {
    expect(() => createRequestScheduler(configuration)).toThrow(RangeError);
  });

  it("starts requests in FIFO order within the concurrency limit", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 2 });
    const starts: string[] = [];
    const first = createDeferredPromise<string>();
    const second = createDeferredPromise<string>();
    const third = createDeferredPromise<string>();

    const firstResult = scheduler.schedule(() => {
      starts.push("first");
      return first.promise;
    });
    const secondResult = scheduler.schedule(() => {
      starts.push("second");
      return second.promise;
    });
    const thirdResult = scheduler.schedule(() => {
      starts.push("third");
      return third.promise;
    });

    await flushPromises();
    expect(starts).toEqual(["first", "second"]);

    second.resolve("second-result");
    await expect(secondResult).resolves.toBe("second-result");
    await flushPromises();
    expect(starts).toEqual(["first", "second", "third"]);

    first.resolve("first-result");
    third.resolve("third-result");

    await expect(
      Promise.all([firstResult, secondResult, thirdResult])
    ).resolves.toEqual(["first-result", "second-result", "third-result"]);
  });

  it("limits how many requests start within one interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 3,
      rateLimit: { maxRequests: 2, intervalMs: 1_000 },
    });
    const operation = vi.fn(async () => "done");

    const results = [
      scheduler.schedule(operation),
      scheduler.schedule(operation),
      scheduler.schedule(operation),
    ];

    await flushPromises();
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(operation).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(3);
    await expect(Promise.all(results)).resolves.toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("releases a concurrency slot after a request failure", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const failure = new Error("request failed");
    const first = createDeferredPromise<string>();
    const secondOperation = vi.fn(async () => "second-result");

    const firstResult = scheduler.schedule(() => first.promise);
    const secondResult = scheduler.schedule(secondOperation);

    first.reject(failure);

    await expect(firstResult).rejects.toBe(failure);
    await expect(secondResult).resolves.toBe("second-result");
    expect(secondOperation).toHaveBeenCalledOnce();
  });

  it("does not start queued requests while paused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const operation = vi.fn(async () => "done");

    scheduler.pauseFor(1_000);
    const result = scheduler.schedule(operation);

    await flushPromises();
    expect(operation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(operation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("done");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("does not start a request aborted while waiting in the queue", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const activeRequest = createDeferredPromise<void>();
    const queuedOperation = vi.fn(async () => "queued-result");
    const controller = new AbortController();

    const activeResult = scheduler.schedule(() => activeRequest.promise);
    const queuedResult = scheduler.schedule(queuedOperation, {
      signal: controller.signal,
    });

    controller.abort();

    await expect(queuedResult).rejects.toMatchObject({ name: "AbortError" });
    expect(queuedOperation).not.toHaveBeenCalled();

    activeRequest.resolve();
    await expect(activeResult).resolves.toBeUndefined();
  });
});

/**
 * Reprezentuje ręcznie sterowany Promise używany do kontroli kolejności testu.
 *
 * @property promise - Promise oczekujący na ręczne zakończenie.
 * @property resolve - Kończy Promise przekazaną wartością.
 * @property reject - Kończy Promise przekazanym błędem.
 */
type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
    reject(reason) {
      rejectPromise?.(reason);
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
