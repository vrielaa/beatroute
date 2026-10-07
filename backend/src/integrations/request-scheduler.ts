/**
 * Określa limit liczby zapytań rozpoczynanych w danym przedziale czasu.
 *
 * @property maxRequests - Maksymalna liczba zapytań rozpoczynanych w jednym przedziale.
 * @property intervalMs - Długość kontrolowanego przedziału w milisekundach.
 */
type RequestRateLimit = {
  maxRequests: number;
  intervalMs: number;
};

/**
 * Określa zasady kolejkowania wychodzących zapytań HTTP.
 *
 * @property maxConcurrentRequests - Maksymalna liczba jednocześnie wykonywanych zapytań.
 * @property rateLimit - Opcjonalny limit tempa rozpoczynania kolejnych zapytań.
 */
type RequestSchedulerConfiguration = {
  maxConcurrentRequests: number;
  rateLimit?: RequestRateLimit;
};

/**
 * Określa opcje pojedynczej operacji przekazanej do schedulera.
 *
 * @property signal - Opcjonalny sygnał pozwalający anulować operację oczekującą w kolejce.
 */
type ScheduledRequestOptions = {
  signal?: AbortSignal;
};

/**
 * Udostępnia operacje kolejkowania i czasowego wstrzymywania zapytań.
 *
 * @property schedule - Dodaje operację do kolejki i zwraca jej wynik po wykonaniu.
 * @property pauseFor - Wstrzymuje rozpoczynanie nowych operacji na podany czas.
 */
type RequestScheduler = {
  schedule<T>(
    operation: () => Promise<T>,
    options?: ScheduledRequestOptions
  ): Promise<T>;
  pauseFor(delayMs: number): void;
};

/**
 * Reprezentuje operację oczekującą na dopuszczenie do wykonania.
 *
 * @property operation - Funkcja uruchamiana po spełnieniu limitów schedulera.
 * @property resolve - Kończy Promise wynikiem wykonanej operacji.
 * @property reject - Kończy Promise błędem wykonania albo anulowania.
 * @property signal - Opcjonalny sygnał anulowania operacji oczekującej.
 * @property abortListener - Funkcja usuwająca anulowaną operację z kolejki.
 */
type QueuedRequest = {
  operation: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
};

/**
 * Tworzy scheduler ograniczający równoległość i tempo wychodzących zapytań.
 * Operacje są rozpoczynane w kolejności FIFO. Czas oczekiwania w kolejce nie
 * jest częścią timeoutu samego zapytania HTTP.
 *
 * @param configuration - Limity równoległości i opcjonalny limit czasowy.
 * @returns Scheduler zachowujący wynik i błędy przekazanych operacji.
 */
function createRequestScheduler({
  maxConcurrentRequests,
  rateLimit,
}: RequestSchedulerConfiguration): RequestScheduler {
  validateConfiguration({ maxConcurrentRequests, rateLimit });

  const queue: QueuedRequest[] = [];
  const requestStartTimes: number[] = [];
  let activeRequests = 0;
  let pausedUntilMs = 0;
  let wakeUpTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeUpAtMs = 0;

  function schedule<T>(
    operation: () => Promise<T>,
    { signal }: ScheduledRequestOptions = {}
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(getAbortReason(signal));
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        operation,
        resolve: (value) => resolve(value as T),
        reject,
        signal,
      };

      if (signal) {
        request.abortListener = () => cancelQueuedRequest(request);
        signal.addEventListener("abort", request.abortListener, { once: true });
      }

      queue.push(request);
      processQueue();
    });
  }

  function pauseFor(delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("Request scheduler pause cannot be negative");
    }

    pausedUntilMs = Math.max(pausedUntilMs, Date.now() + delayMs);
    processQueue();
  }

  function processQueue(): void {
    if (queue.length === 0) {
      clearWakeUpTimer();
      return;
    }

    while (queue.length > 0 && activeRequests < maxConcurrentRequests) {
      const currentTimeMs = Date.now();

      if (pausedUntilMs > currentTimeMs) {
        scheduleWakeUp(pausedUntilMs);
        return;
      }

      removeExpiredStartTimes(currentTimeMs);

      const nextRateLimitSlotMs = getNextRateLimitSlotMs();

      if (nextRateLimitSlotMs !== null) {
        scheduleWakeUp(nextRateLimitSlotMs);
        return;
      }

      const request = queue.shift();

      if (!request) {
        return;
      }

      if (request.signal?.aborted) {
        removeAbortListener(request);
        request.reject(getAbortReason(request.signal));
        continue;
      }

      startRequest(request, currentTimeMs);
    }
  }

  function startRequest(request: QueuedRequest, startTimeMs: number): void {
    removeAbortListener(request);
    activeRequests += 1;

    if (rateLimit) {
      requestStartTimes.push(startTimeMs);
    }

    Promise.resolve()
      .then(request.operation)
      .then(request.resolve, request.reject)
      .finally(() => {
        activeRequests -= 1;
        processQueue();
      });
  }

  function cancelQueuedRequest(request: QueuedRequest): void {
    const requestIndex = queue.indexOf(request);

    if (requestIndex === -1) {
      return;
    }

    queue.splice(requestIndex, 1);
    removeAbortListener(request);
    request.reject(getAbortReason(request.signal));
    processQueue();
  }

  function removeExpiredStartTimes(currentTimeMs: number): void {
    if (!rateLimit) {
      return;
    }

    const intervalStartMs = currentTimeMs - rateLimit.intervalMs;

    while (
      requestStartTimes.length > 0 &&
      requestStartTimes[0] <= intervalStartMs
    ) {
      requestStartTimes.shift();
    }
  }

  function getNextRateLimitSlotMs(): number | null {
    if (!rateLimit || requestStartTimes.length < rateLimit.maxRequests) {
      return null;
    }

    return requestStartTimes[0] + rateLimit.intervalMs;
  }

  function scheduleWakeUp(wakeUpTimeMs: number): void {
    if (wakeUpTimer !== null && wakeUpAtMs <= wakeUpTimeMs) {
      return;
    }

    clearWakeUpTimer();
    wakeUpAtMs = wakeUpTimeMs;
    wakeUpTimer = setTimeout(
      () => {
        wakeUpTimer = null;
        wakeUpAtMs = 0;
        processQueue();
      },
      Math.max(0, wakeUpTimeMs - Date.now())
    );
  }

  function clearWakeUpTimer(): void {
    if (wakeUpTimer === null) {
      return;
    }

    clearTimeout(wakeUpTimer);
    wakeUpTimer = null;
    wakeUpAtMs = 0;
  }

  return { schedule, pauseFor };
}

/** Sprawdza poprawność wszystkich limitów schedulera. */
function validateConfiguration({
  maxConcurrentRequests,
  rateLimit,
}: RequestSchedulerConfiguration): void {
  assertPositiveInteger(maxConcurrentRequests, "Maximum concurrent requests");

  if (!rateLimit) {
    return;
  }

  assertPositiveInteger(rateLimit.maxRequests, "Maximum requests per interval");
  assertPositiveInteger(rateLimit.intervalMs, "Request rate interval");
}

/** Sprawdza, czy wartość jest dodatnią liczbą całkowitą. */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/** Usuwa listener anulowania po opuszczeniu kolejki przez operację. */
function removeAbortListener(request: QueuedRequest): void {
  if (!request.signal || !request.abortListener) {
    return;
  }

  request.signal.removeEventListener("abort", request.abortListener);
  request.abortListener = undefined;
}

/** Zwraca przyczynę anulowania zapisaną przez `AbortSignal`. */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return (
    signal?.reason ?? new DOMException("Request was aborted", "AbortError")
  );
}

export { createRequestScheduler };
export type {
  RequestRateLimit,
  RequestScheduler,
  RequestSchedulerConfiguration,
  ScheduledRequestOptions,
};
