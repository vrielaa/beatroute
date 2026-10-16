import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Fragment odpowiedzi błędu zwracanej przez API ReccoBeats. */
type ReccoBeatsApiErrorData = {
  /** Szczegóły błędu przekazane przez zewnętrzną usługę. */
  error?: {
    /** Komunikat opisujący przyczynę niepowodzenia. */
    message?: string;
    /** Kod statusu w treści błędu; nie określa statusu odpowiedzi HTTP. */
    status?: number;
  };
};

/**
 * Dodatkowe informacje opisujące błąd ReccoBeats.
 *
 * @property category - Znaczenie błędu niezależne od konkretnego API.
 * @property retryAfterSeconds - Czas z nagłówka `Retry-After` albo pozostały
 * czas lokalnej pauzy, wyrażony w sekundach.
 * @property upstreamStatus - Status odpowiedzi źródłowej; domyślnie `status`.
 * Jawne `null` oznacza lokalną odmowę bez nowej odpowiedzi ReccoBeats.
 */
type ReccoBeatsApiErrorOptions = {
  category?: IntegrationErrorCategory;
  retryAfterSeconds?: number | null;
  upstreamStatus?: number | null;
};

/** Błąd odpowiedzi ReccoBeats, transportu albo lokalnej pauzy zapytań. */
class ReccoBeatsApiError extends IntegrationApiError {
  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param status - Status HTTP odpowiedzi albo status zastępczy transportu lub pauzy.
   * @param data - Oryginalne dane błędu; `null` dla lokalnej odmowy.
   * @param options - Kategoria, czas ponowienia i opcjonalny status źródłowy.
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
      upstreamStatus:
        options.upstreamStatus === undefined ? status : options.upstreamStatus,
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
