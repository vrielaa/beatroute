import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Błąd odpowiedzi otrzymanej ze Spotify Web API. */
class SpotifyApiError extends IntegrationApiError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null,
    category: IntegrationErrorCategory = classifySpotifyError(status)
  ) {
    super("spotify", message, {
      category,
      upstreamStatus: status,
      details: data,
    });
    this.name = "SpotifyApiError";
  }
}

/** Tłumaczy status Spotify Web API na znaczenie niezależne od dostawcy. */
function classifySpotifyError(status: number): IntegrationErrorCategory {
  if (status === 401) {
    return "authentication";
  }

  if (status === 403) {
    return "authorization";
  }

  if (status === 429) {
    return "rate-limited";
  }

  if (status === 503) {
    return "unavailable";
  }

  if (status >= 400 && status < 500) {
    return "request-rejected";
  }

  return "upstream-error";
}

export { SpotifyApiError };
