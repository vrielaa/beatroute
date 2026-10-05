import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Błąd komunikacji lub niepoprawnej odpowiedzi API Soundcharts. */
class SoundchartsApiError extends IntegrationApiError {
  constructor(
    message: string,
    upstreamStatus: number | null = null,
    details: unknown = null,
    category: IntegrationErrorCategory = classifySoundchartsError(
      upstreamStatus
    )
  ) {
    super("soundcharts", message, {
      category,
      upstreamStatus,
      details,
    });
    this.name = "SoundchartsApiError";
  }
}

/** Tłumaczy status Soundcharts na znaczenie niezależne od dostawcy. */
function classifySoundchartsError(
  status: number | null
): IntegrationErrorCategory {
  if (status === 401 || status === 403) {
    return "configuration";
  }

  if (status === 429) {
    return "rate-limited";
  }

  if (status === 503) {
    return "unavailable";
  }

  return "upstream-error";
}

export { SoundchartsApiError };
