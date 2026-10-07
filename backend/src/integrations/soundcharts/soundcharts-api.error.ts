import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

type SoundchartsApiErrorOptions = {
  category?: IntegrationErrorCategory;
  retryAfterSeconds?: number | null;
};

/** Błąd komunikacji lub niepoprawnej odpowiedzi API Soundcharts. */
class SoundchartsApiError extends IntegrationApiError {
  constructor(
    message: string,
    status: number | null = null,
    data: unknown = null,
    options: SoundchartsApiErrorOptions = {}
  ) {
    super("soundcharts", message, {
      category: options.category ?? classifySoundchartsError(status),
      upstreamStatus: status,
      details: data,
      retryAfterSeconds: options.retryAfterSeconds,
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
