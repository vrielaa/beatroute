import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Dodatkowe informacje opisujące błąd Last.fm. */
type LastfmApiErrorOptions = {
  /** Znaczenie błędu niezależne od konkretnego API. */
  category?: IntegrationErrorCategory;
  /** Status HTTP zwrócony przez Last.fm, jeśli odpowiedź została odebrana. */
  upstreamStatus?: number | null;
  /** Czas oczekiwania przekazany w nagłówku `Retry-After`. */
  retryAfterSeconds?: number | null;
  /** Dane przeznaczone wyłącznie do diagnostyki backendu. */
  details?: unknown;
};

/** Błąd odpowiedzi lub komunikacji z API Last.fm. */
class LastfmApiError extends IntegrationApiError {
  /** Kod błędu zdefiniowany przez Last.fm albo `null` dla błędu transportu. */
  public readonly code: number | null;

  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param code - Kod błędu zwrócony w treści odpowiedzi Last.fm.
   * @param options - Status HTTP, kategoria, czas ponowienia i diagnostyka.
   */
  constructor(
    message: string,
    code: number | null = null,
    options: LastfmApiErrorOptions = {}
  ) {
    super("lastfm", message, {
      category:
        options.category ??
        classifyLastfmError(code, options.upstreamStatus ?? null),
      upstreamStatus: options.upstreamStatus,
      upstreamCode: code,
      retryAfterSeconds: options.retryAfterSeconds,
      details: options.details,
    });
    this.name = "LastfmApiError";
    this.code = code;
  }
}

/** Tłumaczy kod Last.fm i status HTTP na znaczenie niezależne od dostawcy. */
function classifyLastfmError(
  code: number | null,
  status: number | null
): IntegrationErrorCategory {
  if (code === 9 || status === 401) {
    return "authentication";
  }

  if (code === 10 || code === 26) {
    return "configuration";
  }

  if (code === 29 || status === 429) {
    return "rate-limited";
  }

  if (code === 11 || code === 16 || status === 503) {
    return "unavailable";
  }

  if (status !== null && status >= 400 && status < 500) {
    return "request-rejected";
  }

  return "upstream-error";
}

export { LastfmApiError };
export type { LastfmApiErrorOptions };
