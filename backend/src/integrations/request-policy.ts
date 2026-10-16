import type { RequestScheduler } from "./request-scheduler.js";
import { RequestSchedulerPausedError } from "./request-scheduler.js";

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
 * @property baseRetryDelayMs - Początkowe opóźnienie backoffu, stosowane również
 * wtedy, gdy `Retry-After` wskazuje krótszy czas oczekiwania.
 * @property maxRetryDelayMs - Najdłuższe akceptowane opóźnienie przed kolejną
 * próbą. Nie skraca pauzy schedulera wymaganej przez dłuższy `Retry-After`.
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

/** Błąd pojedynczej próby HTTP rozróżniający awarię sieci, timeout i anulowanie. */
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
 * Zachowuje status błędnej odpowiedzi HTTP, która spowodowała pauzę schedulera.
 * Nie przechowuje treści odpowiedzi ani nagłówków i nie zastępuje odpowiedzi
 * zwracanej po zakończeniu prób. Służy wyłącznie jako przyczyna błędu pauzy.
 *
 * @property status - Status odpowiedzi otrzymanej przed rozpoczęciem pauzy.
 */
class HttpResponseError extends Error {
  constructor(public readonly status: number) {
    super(`External API responded with HTTP ${status}`);
    this.name = "HttpResponseError";
  }
}

/**
 * Tworzy wykonawcę żądań stosującego wspólny timeout i politykę retry.
 * Automatyczne ponowienia dotyczą wyłącznie metod `GET` i `HEAD`. Odpowiedź
 * HTTP po ostatniej próbie jest zwracana klientowi integracji do dalszego
 * zmapowania na błąd konkretnego dostawcy. Odmowa schedulera podczas pauzy
 * jest przekazywana bez zmian, bez ponawiania i bez klasyfikacji jako błąd sieci.
 * Odpowiedź `429` albo inna błędna odpowiedź z poprawnym `Retry-After`
 * wstrzymuje scheduler na dłuższy z czasów: backoff lub `Retry-After`.
 * Pauza obowiązuje również wtedy, gdy żądanie nie zostanie ponowione.
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

  /**
   * Wykonuje jedną próbę HTTP przez scheduler, bez oceniania statusu odpowiedzi.
   * Timeout rozpoczyna się po opuszczeniu kolejki. Błędy transportu są
   * klasyfikowane, a odmowa schedulera podczas pauzy jest przekazywana bez zmian.
   */
  async function executeAttempt(
    url: string,
    requestOptions: RequestInit
  ): Promise<Response> {
    let timeoutSignal: AbortSignal | null = null;

    const performFetch = () => {
      timeoutSignal = AbortSignal.timeout(policy.timeoutMs);
      const signal = requestOptions.signal
        ? AbortSignal.any([requestOptions.signal, timeoutSignal])
        : timeoutSignal;

      return fetchImpl(url, { ...requestOptions, signal });
    };

    try {
      return scheduler
        ? await scheduler.schedule(
            performFetch,
            requestOptions.signal
              ? { signal: requestOptions.signal }
              : undefined
          )
        : await performFetch();
    } catch (cause) {
      if (cause instanceof RequestSchedulerPausedError) {
        throw cause;
      }

      const failureKind = getFailureKind(
        cause,
        requestOptions.signal,
        timeoutSignal
      );

      throw new HttpRequestExecutionError(
        getFailureMessage(failureKind),
        failureKind,
        cause
      );
    }
  }

  return async function executeHttpRequest(
    url: string,
    requestOptions: RequestInit = {}
  ): Promise<Response> {
    const method = (requestOptions.method ?? "GET").toUpperCase();
    const methodAllowsRetry = RETRYABLE_HTTP_METHODS.has(method);

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const isLastAttempt = attempt === policy.maxAttempts;
      let response: Response;

      try {
        response = await executeAttempt(url, requestOptions);
      } catch (error) {
        if (
          !(error instanceof HttpRequestExecutionError) ||
          !methodAllowsRetry ||
          error.kind === "aborted" ||
          isLastAttempt
        ) {
          throw error;
        }

        await sleep(calculateBackoffDelayMs(attempt, policy));
        continue;
      }

      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get("retry-after"),
        now()
      );
      const responseDelayMs = calculateResponseDelayMs(
        retryAfterSeconds,
        attempt,
        policy
      );

      if (
        scheduler &&
        !response.ok &&
        (response.status === 429 || retryAfterSeconds !== null)
      ) {
        scheduler.pauseFor(responseDelayMs, {
          cause: new HttpResponseError(response.status),
        });
      }

      if (
        !methodAllowsRetry ||
        isLastAttempt ||
        !policy.retryableStatuses.includes(response.status) ||
        responseDelayMs > policy.maxRetryDelayMs
      ) {
        return response;
      }

      await sleep(responseDelayMs);
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

/** Wybiera dłuższy czas oczekiwania: `Retry-After` lub wykładniczy backoff. */
function calculateResponseDelayMs(
  retryAfterSeconds: number | null,
  attempt: number,
  policy: HttpRequestPolicy
): number {
  const retryAfterMs = (retryAfterSeconds ?? 0) * 1_000;
  const backoffDelayMs = calculateBackoffDelayMs(attempt, policy);

  return Math.max(retryAfterMs, backoffDelayMs);
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
  HttpResponseError,
  createHttpRequestExecutor,
  parseRetryAfterSeconds,
};
export type {
  HttpRequestPolicy,
  HttpRequestExecutorConfiguration,
  HttpRequestFailureKind,
};
