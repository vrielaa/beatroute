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
 * @property pauseBehavior - Zachowanie podczas pauzy: domyślne `wait` zachowuje
 * kolejkę, a `reject` odrzuca nowe i oczekujące operacje bez ich wykonywania.
 * Nie zmienia oczekiwania wynikającego z limitu równoległości ani tempa.
 */
type RequestSchedulerConfiguration = {
  maxConcurrentRequests: number;
  rateLimit?: RequestRateLimit;
  pauseBehavior?: "wait" | "reject";
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
 * @property schedule - Zwraca wynik operacji albo błąd wykonania, anulowania
 * lub odrzucenia podczas pauzy. Kolejkuje operacje oczekujące na wolny limit.
 * @property pauseFor - Wstrzymuje rozpoczynanie operacji i stosuje wybrany
 * tryb pauzy wobec kolejki. Może zachować przyczynę pauzy jako `cause` błędu.
 * Nie anuluje operacji, które już się wykonują.
 */
type RequestScheduler = {
  schedule<T>(
    operation: () => Promise<T>,
    options?: ScheduledRequestOptions
  ): Promise<T>;
  pauseFor(delayMs: number, options?: ErrorOptions): void;
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
 * Oznacza odmowę rozpoczęcia operacji podczas pauzy schedulera.
 * Nie jest błędem transportu ani odpowiedzią otrzymaną z zewnętrznego API.
 *
 * @property remainingPauseMs - Pozostały czas pauzy w milisekundach w chwili
 * utworzenia błędu; wartość nie aktualizuje się po przekazaniu wywołującemu.
 * @property cause - Opcjonalna przyczyna zapisana podczas wywołania `pauseFor`.
 */
class RequestSchedulerPausedError extends Error {
  constructor(
    public readonly remainingPauseMs: number,
    options?: ErrorOptions
  ) {
    super("Request scheduler is paused", options);
    this.name = "RequestSchedulerPausedError";
  }
}

/**
 * Tworzy scheduler ograniczający równoległość i tempo wychodzących zapytań.
 * Operacje są rozpoczynane w kolejności FIFO. Czas oczekiwania w kolejce nie
 * jest częścią timeoutu samego zapytania HTTP. Domyślnie pauza zachowuje
 * kolejkę. Tryb `reject` odrzuca nowe i oczekujące operacje, ale nie przerywa
 * już wykonywanych. Odrzucone operacje nie wracają do kolejki po końcu pauzy.
 *
 * @param configuration - Limity równoległości i tempa oraz zachowanie podczas pauzy.
 * @returns Scheduler zachowujący wynik i błędy przekazanych operacji.
 */
function createRequestScheduler({
  maxConcurrentRequests,
  rateLimit,
  pauseBehavior = "wait",
}: RequestSchedulerConfiguration): RequestScheduler {
  validateConfiguration({ maxConcurrentRequests, rateLimit });

  const queue: QueuedRequest[] = [];
  const requestStartTimes: number[] = [];
  let activeRequests = 0;
  let pausedUntilMs = 0;
  let pauseCause: unknown;
  let wakeUpTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeUpAtMs = 0;

  function schedule<T>(
    operation: () => Promise<T>,
    { signal }: ScheduledRequestOptions = {}
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(getAbortReason(signal));
    }

    const pauseError = getCurrentPauseError();

    if (pauseError) {
      return Promise.reject(pauseError);
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

  function pauseFor(delayMs: number, { cause }: ErrorOptions = {}): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("Request scheduler pause cannot be negative");
    }

    const nextPauseUntilMs = Date.now() + delayMs;

    if (nextPauseUntilMs >= pausedUntilMs) {
      pausedUntilMs = nextPauseUntilMs;
      pauseCause = cause;
    }

    processQueue();
  }

  function processQueue(): void {
    if (queue.length === 0) {
      clearWakeUpTimer();
      return;
    }

    const pauseError = getCurrentPauseError();

    if (pauseError) {
      rejectQueuedRequests(pauseError);
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
      .then(() => {
        const pauseError = getCurrentPauseError();

        if (pauseError) {
          throw pauseError;
        }

        return request.operation();
      })
      .then(request.resolve, request.reject)
      .finally(() => {
        activeRequests -= 1;
        processQueue();
      });
  }

  /** Zwraca błąd aktualnej pauzy wyłącznie wtedy, gdy włączono tryb odrzucania. */
  function getCurrentPauseError(): RequestSchedulerPausedError | null {
    if (pauseBehavior !== "reject") {
      return null;
    }

    const remainingPauseMs = pausedUntilMs - Date.now();

    return remainingPauseMs > 0
      ? new RequestSchedulerPausedError(remainingPauseMs, { cause: pauseCause })
      : null;
  }

  /** Opróżnia kolejkę, usuwa listenery anulowania i kończy operacje błędem pauzy. */
  function rejectQueuedRequests(pauseError: RequestSchedulerPausedError): void {
    for (const request of queue.splice(0)) {
      removeAbortListener(request);
      request.reject(
        new RequestSchedulerPausedError(pauseError.remainingPauseMs, {
          cause: pauseError.cause,
        })
      );
    }
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

export { createRequestScheduler, RequestSchedulerPausedError };
export type {
  RequestRateLimit,
  RequestScheduler,
  RequestSchedulerConfiguration,
  ScheduledRequestOptions,
};
