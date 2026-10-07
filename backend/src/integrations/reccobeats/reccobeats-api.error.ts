import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Fragment odpowiedzi błędu zwracanej przez API ReccoBeats. */
type ReccoBeatsApiErrorData = {
  /** Szczegóły błędu przekazane przez zewnętrzną usługę. */
  error?: {
    /** Komunikat opisujący przyczynę niepowodzenia. */
    message?: string;
    /** Status HTTP zapisany w treści odpowiedzi. */
    status?: number;
  };
};

/** Dodatkowe informacje opisujące błąd ReccoBeats. */
type ReccoBeatsApiErrorOptions = {
  /** Znaczenie błędu niezależne od konkretnego API. */
  category?: IntegrationErrorCategory;

  /** Czas oczekiwania przekazany w nagłówku Retry-After. */
  retryAfterSeconds?: number | null;
};

/** Błąd nieudanego zapytania do API ReccoBeats. */
class ReccoBeatsApiError extends IntegrationApiError {
  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param status - Status HTTP odpowiedzi ReccoBeats.
   * @param data - Oryginalne dane odpowiedzi błędu.
   * @param options - Dodatkowe opcje błędu.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown,
    options: ReccoBeatsApiErrorOptions = {}
  ) {
    super("reccobeats", message, {
      category: options.category ?? classifyReccoBeatsError(status),
      retryAfterSeconds: options.retryAfterSeconds ?? null,
      upstreamStatus: status,
      details: data,
    });
    this.name = "ReccoBeatsApiError";
  }
}

/** Tłumaczy status ReccoBeats na znaczenie niezależne od dostawcy. */
function classifyReccoBeatsError(status: number): IntegrationErrorCategory {
  if (status === 429) {
    return "rate-limited";
  }

  if (status === 503) {
    return "unavailable";
  }

  return "upstream-error";
}

export { ReccoBeatsApiError };
