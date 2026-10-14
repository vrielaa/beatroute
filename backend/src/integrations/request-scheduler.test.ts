import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRequestScheduler,
  RequestSchedulerPausedError,
} from "./request-scheduler.js";

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

  it("rejects a new request immediately during a long pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const operation = vi.fn(async () => "done");

    scheduler.pauseFor(62_976_000);
    const result = scheduler.schedule(operation);

    await expect(result).rejects.toBeInstanceOf(RequestSchedulerPausedError);
    await expect(result).rejects.toMatchObject({
      name: "RequestSchedulerPausedError",
      remainingPauseMs: 62_976_000,
    });
    expect(operation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the remaining pause at the time of each rejection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const operation = vi.fn(async () => "done");

    scheduler.pauseFor(5_000);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(scheduler.schedule(operation)).rejects.toMatchObject({
      remainingPauseMs: 3_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(scheduler.schedule(operation)).rejects.toMatchObject({
      remainingPauseMs: 2_000,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects all queued requests while active requests keep their results", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 2,
      pauseBehavior: "reject",
    });
    const first = createDeferredPromise<string>();
    const second = createDeferredPromise<string>();
    const failure = new Error("active request failed");
    const thirdOperation = vi.fn(async () => "third-result");
    const fourthOperation = vi.fn(async () => "fourth-result");
    const firstResult = scheduler.schedule(() => first.promise);
    const secondResult = scheduler.schedule(() => second.promise);
    const thirdResult = scheduler.schedule(thirdOperation);
    const fourthResult = scheduler.schedule(fourthOperation);
    const thirdRejection = expect(thirdResult).rejects.toMatchObject({
      remainingPauseMs: 5_000,
    });
    const fourthRejection = expect(fourthResult).rejects.toBeInstanceOf(
      RequestSchedulerPausedError
    );

    await flushPromises();
    scheduler.pauseFor(5_000);

    await thirdRejection;
    await fourthRejection;
    expect(thirdOperation).not.toHaveBeenCalled();
    expect(fourthOperation).not.toHaveBeenCalled();

    const secondRejection = expect(secondResult).rejects.toBe(failure);
    first.resolve("first-result");
    second.reject(failure);

    await expect(firstResult).resolves.toBe("first-result");
    await secondRejection;
    await vi.advanceTimersByTimeAsync(5_000);

    const nextOperation = vi.fn(async () => "next-result");
    await expect(scheduler.schedule(nextOperation)).resolves.toBe(
      "next-result"
    );
    expect(nextOperation).toHaveBeenCalledOnce();
    expect(thirdOperation).not.toHaveBeenCalled();
    expect(fourthOperation).not.toHaveBeenCalled();
  });

  it("removes abort listeners from requests rejected during a pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const active = createDeferredPromise<void>();
    const activeResult = scheduler.schedule(() => active.promise);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const queuedOperation = vi.fn(async () => "queued-result");
    const queuedResult = scheduler.schedule(queuedOperation, {
      signal: controller.signal,
    });
    const rejection = expect(queuedResult).rejects.toBeInstanceOf(
      RequestSchedulerPausedError
    );

    await flushPromises();
    scheduler.pauseFor(1_000);

    await rejection;
    expect(removeListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));

    controller.abort();
    active.resolve();

    await activeResult;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queuedOperation).not.toHaveBeenCalled();
  });

  it("does not run a reserved operation paused before its execution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const operation = vi.fn(async () => "done");
    const result = scheduler.schedule(operation);

    scheduler.pauseFor(1_000);

    await expect(result).rejects.toBeInstanceOf(RequestSchedulerPausedError);
    expect(operation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(scheduler.schedule(operation)).resolves.toBe("done");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("accepts new requests at the end of the pause without reviving rejected ones", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const rejectedOperation = vi.fn(async () => "rejected-result");
    const nextOperation = vi.fn(async () => "next-result");

    scheduler.pauseFor(1_000);

    await expect(scheduler.schedule(rejectedOperation)).rejects.toMatchObject({
      remainingPauseMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(999);
    await expect(scheduler.schedule(rejectedOperation)).rejects.toMatchObject({
      remainingPauseMs: 1,
    });
    await vi.advanceTimersByTimeAsync(1);

    await expect(scheduler.schedule(nextOperation)).resolves.toBe(
      "next-result"
    );
    expect(nextOperation).toHaveBeenCalledOnce();
    expect(rejectedOperation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not shorten an existing pause and allows extending it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const operation = vi.fn(async () => "done");

    scheduler.pauseFor(10_000);
    await vi.advanceTimersByTimeAsync(2_000);
    scheduler.pauseFor(1_000);

    await expect(scheduler.schedule(operation)).rejects.toMatchObject({
      remainingPauseMs: 8_000,
    });

    scheduler.pauseFor(20_000);

    await expect(scheduler.schedule(operation)).rejects.toMatchObject({
      remainingPauseMs: 20_000,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("keeps normal concurrency queueing when rejection mode is enabled", async () => {
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const active = createDeferredPromise<string>();
    const nextOperation = vi.fn(async () => "next-result");
    const activeResult = scheduler.schedule(() => active.promise);
    const nextResult = scheduler.schedule(nextOperation);

    await flushPromises();
    expect(nextOperation).not.toHaveBeenCalled();

    active.resolve("active-result");

    await expect(activeResult).resolves.toBe("active-result");
    await expect(nextResult).resolves.toBe("next-result");
    expect(nextOperation).toHaveBeenCalledOnce();
  });

  it("keeps normal rate-limit queueing when rejection mode is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 2,
      rateLimit: { maxRequests: 1, intervalMs: 1_000 },
      pauseBehavior: "reject",
    });
    const firstOperation = vi.fn(async () => "first-result");
    const secondOperation = vi.fn(async () => "second-result");
    const firstResult = scheduler.schedule(firstOperation);
    const secondResult = scheduler.schedule(secondOperation);

    await expect(firstResult).resolves.toBe("first-result");
    expect(secondOperation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(secondOperation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(secondResult).resolves.toBe("second-result");
    expect(secondOperation).toHaveBeenCalledOnce();
  });

  it("clears a rate-limit timer when paused requests are rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 2,
      rateLimit: { maxRequests: 1, intervalMs: 1_000 },
      pauseBehavior: "reject",
    });
    const firstResult = scheduler.schedule(async () => "first-result");
    const queuedOperation = vi.fn(async () => "queued-result");
    const queuedResult = scheduler.schedule(queuedOperation);
    const rejection = expect(queuedResult).rejects.toMatchObject({
      remainingPauseMs: 5_000,
    });

    await expect(firstResult).resolves.toBe("first-result");
    expect(vi.getTimerCount()).toBe(1);

    scheduler.pauseFor(5_000);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(queuedOperation).not.toHaveBeenCalled();
  });

  it("does not reject requests when the pause duration is zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });

    scheduler.pauseFor(0);

    await expect(scheduler.schedule(async () => "done")).resolves.toBe("done");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid pause duration: %s",
    (delayMs) => {
      const scheduler = createRequestScheduler({
        maxConcurrentRequests: 1,
        pauseBehavior: "reject",
      });

      expect(() => scheduler.pauseFor(delayMs)).toThrow(RangeError);
    }
  );

  it("preserves an already aborted request reason during a pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scheduler = createRequestScheduler({
      maxConcurrentRequests: 1,
      pauseBehavior: "reject",
    });
    const controller = new AbortController();
    const abortReason = new Error("request cancelled");
    const operation = vi.fn(async () => "done");

    controller.abort(abortReason);
    scheduler.pauseFor(1_000);

    await expect(
      scheduler.schedule(operation, { signal: controller.signal })
    ).rejects.toBe(abortReason);
    expect(operation).not.toHaveBeenCalled();
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
