import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

const MAX_RETRIES = 3;
const MAX_DELAY_MS = 30_000;
const BASE_DELAY_MS = 1_000;
const RETRY_RATE_LIMITED_READS = new HttpContextToken(() => true);

/**
 * Ponawia wyłącznie odczyty GET po `429`. Respektuje `Retry-After` i przekazuje
 * błąd do widoku, gdy wymagane oczekiwanie przekracza 30 sekund. Bez poprawnego
 * nagłówka stosuje ograniczony backoff. Nigdy nie ponawia zapisów POST.
 * Wywołujący może wyłączyć retry przez kontekst RETRY_RATE_LIMITED_READS.
 */
const rateLimitRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const method = req.method.toUpperCase();

  if (method !== 'GET' || !req.context.get(RETRY_RATE_LIMITED_READS)) {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: MAX_RETRIES,
      delay: (error: unknown, retryCount: number) => {
        if (!(error instanceof HttpErrorResponse)) {
          return throwError(() => error);
        }

        if (error.status !== 429) {
          return throwError(() => error);
        }

        const retryAfterMs = readRetryAfterDelayMs(error.headers.get('Retry-After'));

        if (retryAfterMs !== null && retryAfterMs > MAX_DELAY_MS) {
          return throwError(() => error);
        }

        const delayMs = retryAfterMs ?? Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** retryCount);
        return timer(delayMs);
      },
    })
  );
};

/** Odczytuje czas oczekiwania z liczby sekund albo daty HTTP; błędny nagłówek daje null. */
function readRetryAfterDelayMs(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (/^\d+$/.test(normalizedValue)) {
    const seconds = Number(normalizedValue);

    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null;
  }

  if (!/^[A-Za-z]{3}, /.test(normalizedValue)) {
    return null;
  }

  const retryDateMs = Date.parse(normalizedValue);

  return Number.isFinite(retryDateMs) ? Math.max(0, retryDateMs - Date.now()) : null;
}

export { rateLimitRetryInterceptor, RETRY_RATE_LIMITED_READS };
