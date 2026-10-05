import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Błąd odpowiedzi lub komunikacji z API Last.fm. */
class LastfmApiError extends IntegrationApiError {
  /** Kod błędu zdefiniowany przez Last.fm albo `null` dla błędu transportu. */
  public readonly code: number | null;

  constructor(
    message: string,
    code: number | null = null,
    category: IntegrationErrorCategory = classifyLastfmError(code)
  ) {
    super("lastfm", message, {
      category,
      upstreamCode: code,
    });
    this.name = "LastfmApiError";
    this.code = code;
  }
}

/** Tłumaczy kod Last.fm na znaczenie niezależne od dostawcy. */
function classifyLastfmError(code: number | null): IntegrationErrorCategory {
  if (code === 9) {
    return "authentication";
  }

  if (code === 10 || code === 26) {
    return "configuration";
  }

  if (code === 29) {
    return "rate-limited";
  }

  if (code === 11 || code === 16) {
    return "unavailable";
  }

  return "upstream-error";
}

export { LastfmApiError };
