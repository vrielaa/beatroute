import type { RequestScheduler } from "./request-scheduler.js";

/** Metody HTTP, których ponowienie nie powinno zmieniać stanu zewnętrznego API. */
const RETRYABLE_HTTP_METHODS = new Set(["GET", "HEAD"]);

/** Domyślne ustawienia wykonywania odczytów z zewnętrznych API. */
const DEFAULT_HTTP_REQUEST_POLICY: HttpRequestPolicy = {
  timeoutMs: 10_000,
  maxAttempts: 3,
  retryableStatuses: [429, 502, 503, 504],
  baseRetryDelayMs: 500,
  maxRetryDelayMs: 30_000,
};

/**
 * Określa zasady timeoutu i ponawiania odczytów HTTP.
 *
 * @property timeoutMs - Maksymalny czas jednej próby wyrażony w milisekundach.
 * @property maxAttempts - Łączna liczba prób razem z pierwszym żądaniem.
 * @property retryableStatuses - Statusy odpowiedzi pozwalające ponowić bezpieczny odczyt.
 * @property baseRetryDelayMs - Początkowe opóźnienie retry bez nagłówka `Retry-After`.
 * @property maxRetryDelayMs - Najdłuższe akceptowane opóźnienie przed kolejną próbą.
 */
type HttpRequestPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  retryableStatuses: readonly number[];
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
};

/**
 * Określa konfigurację wspólnego wykonawcy żądań do zewnętrznych API.
 *
 * @property fetchImpl - Implementacja `fetch`, którą można zastąpić podczas testów.
 * @property policy - Wartości nadpisujące domyślną politykę żądań.
 * @property scheduler - Opcjonalny scheduler kontrolujący kolejność i tempo prób.
 * @property sleep - Funkcja oczekiwania możliwa do zastąpienia zegarem testowym.
 * @property now - Źródło aktualnego czasu używane przy datach z `Retry-After`.
 */
type HttpRequestExecutorConfiguration = {
  fetchImpl?: typeof fetch;
  policy?: Partial<HttpRequestPolicy>;
  scheduler?: RequestScheduler;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
};

/** Techniczna przyczyna nieudanego wykonania żądania HTTP. */
type HttpRequestFailureKind = "timeout" | "network" | "aborted";

/** Błąd transportu zwracany po wyczerpaniu dopuszczalnych prób. */
class HttpRequestExecutionError extends Error {
  constructor(
    message: string,
    public readonly kind: HttpRequestFailureKind,
    public readonly originalCause: unknown
  ) {
    super(message);
    this.name = "HttpRequestExecutionError";
  }
}

/**
 * Tworzy wykonawcę żądań stosującego wspólny timeout i politykę retry.
 * Automatyczne ponowienia dotyczą wyłącznie metod `GET` i `HEAD`. Odpowiedź
 * HTTP po ostatniej próbie jest zwracana klientowi integracji do dalszego
 * zmapowania na błąd konkretnego dostawcy.
 *
 * @param configuration - Implementacja transportu, polityka i zależności czasu.
 * @returns Funkcja wykonująca żądania HTTP zgodnie ze skonfigurowaną polityką.
 */
function createHttpRequestExecutor({
  fetchImpl = globalThis.fetch,
  policy: policyOverrides = {},
  scheduler,
  sleep = wait,
  now = Date.now,
}: HttpRequestExecutorConfiguration = {}) {
  const policy = resolveRequestPolicy(policyOverrides);

  return async function executeHttpRequest(
    url: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const canRetry = RETRYABLE_HTTP_METHODS.has(method);

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      let timeoutSignal: AbortSignal | null = null;

      const performFetch = () => {
        timeoutSignal = AbortSignal.timeout(policy.timeoutMs);
        const signal = init.signal
          ? AbortSignal.any([init.signal, timeoutSignal])
          : timeoutSignal;

        return fetchImpl(url, { ...init, signal });
      };

      try {
        const response = scheduler
          ? await scheduler.schedule(
              performFetch,
              init.signal ? { signal: init.signal } : undefined
            )
          : await performFetch();
        const retryAfterSeconds = parseRetryAfterSeconds(
          response.headers.get("retry-after"),
          now()
        );

        if (scheduler && !response.ok && retryAfterSeconds !== null) {
          scheduler.pauseFor(retryAfterSeconds * 1_000);
        }

        if (
          !canRetry ||
          attempt === policy.maxAttempts ||
          !policy.retryableStatuses.includes(response.status)
        ) {
          return response;
        }

        const retryDelayMs = getRetryDelayMs(
          retryAfterSeconds,
          attempt,
          policy
        );

        if (retryDelayMs === null) {
          return response;
        }

        await sleep(retryDelayMs);
      } catch (cause) {
        const failureKind = getFailureKind(cause, init.signal, timeoutSignal);

        if (
          !canRetry ||
          failureKind === "aborted" ||
          attempt === policy.maxAttempts
        ) {
          throw new HttpRequestExecutionError(
            getFailureMessage(failureKind),
            failureKind,
            cause
          );
        }

        await sleep(calculateBackoffDelayMs(attempt, policy));
      }
    }

    throw new Error("HTTP request attempts were exhausted unexpectedly");
  };
}

/** Łączy ustawienia domyślne z nadpisaniami i sprawdza ich poprawność. */
function resolveRequestPolicy(
  overrides: Partial<HttpRequestPolicy>
): HttpRequestPolicy {
  const policy = { ...DEFAULT_HTTP_REQUEST_POLICY, ...overrides };

  if (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0) {
    throw new RangeError("HTTP request timeout must be greater than zero");
  }

  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError(
      "HTTP request max attempts must be a positive integer"
    );
  }

  if (
    !Number.isFinite(policy.baseRetryDelayMs) ||
    policy.baseRetryDelayMs < 0
  ) {
    throw new RangeError("HTTP request retry delay cannot be negative");
  }

  if (
    !Number.isFinite(policy.maxRetryDelayMs) ||
    policy.maxRetryDelayMs < policy.baseRetryDelayMs
  ) {
    throw new RangeError(
      "HTTP request maximum retry delay cannot be shorter than the base delay"
    );
  }

  return policy;
}

/** Wyznacza opóźnienie na podstawie `Retry-After` albo strategii wykładniczej. */
function getRetryDelayMs(
  retryAfterSeconds: number | null,
  attempt: number,
  policy: HttpRequestPolicy
): number | null {
  const retryAfterMs =
    retryAfterSeconds !== null ? retryAfterSeconds * 1_000 : null;

  if (retryAfterMs !== null) {
    return retryAfterMs <= policy.maxRetryDelayMs ? retryAfterMs : null;
  }

  return calculateBackoffDelayMs(attempt, policy);
}

/** Odczytuje `Retry-After` podane jako sekundy albo datę HTTP. */
function parseRetryAfterSeconds(
  value: string | null,
  currentTimeMs = Date.now()
): number | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (/^\d+$/.test(normalizedValue)) {
    const seconds = Number(normalizedValue);

    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  const retryDateMs = Date.parse(normalizedValue);

  if (!Number.isFinite(retryDateMs)) {
    return null;
  }

  return Math.max(0, Math.ceil((retryDateMs - currentTimeMs) / 1_000));
}

/** Oblicza wykładnicze opóźnienie i ogranicza je do skonfigurowanego maksimum. */
function calculateBackoffDelayMs(
  attempt: number,
  policy: HttpRequestPolicy
): number {
  return Math.min(
    policy.baseRetryDelayMs * 2 ** (attempt - 1),
    policy.maxRetryDelayMs
  );
}

/** Rozróżnia timeout, błąd sieci i anulowanie przez kod wywołujący. */
function getFailureKind(
  cause: unknown,
  callerSignal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal | null
): HttpRequestFailureKind {
  if (callerSignal?.aborted && !timeoutSignal?.aborted) {
    return "aborted";
  }

  if (
    timeoutSignal?.aborted ||
    (cause instanceof Error && cause.name === "TimeoutError")
  ) {
    return "timeout";
  }

  return "network";
}

/** Zwraca komunikat właściwy dla technicznego rodzaju niepowodzenia. */
function getFailureMessage(kind: HttpRequestFailureKind): string {
  switch (kind) {
    case "timeout":
      return "External API request timed out";
    case "aborted":
      return "External API request was aborted";
    case "network":
      return "External API request failed";
  }
}

/** Oczekuje wskazaną liczbę milisekund. */
function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export {
  DEFAULT_HTTP_REQUEST_POLICY,
  HttpRequestExecutionError,
  createHttpRequestExecutor,
  parseRetryAfterSeconds,
};
export type {
  HttpRequestPolicy,
  HttpRequestExecutorConfiguration,
  HttpRequestFailureKind,
};
