import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

const MAX_RETRIES = 3;
const MAX_DELAY_MS = 30_000;
const BASE_DELAY_MS = 1_000;

export const rateLimitRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const method = req.method.toUpperCase();

  if (method !== 'GET') {
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

        const ms = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** retryCount);
        return timer(ms);
      },
      resetOnSuccess: true,
    })
  );
};
