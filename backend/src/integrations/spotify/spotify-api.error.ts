import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/** Dodatkowe informacje opisujące błąd Spotify Web API. */
type SpotifyApiErrorOptions = {
  /** Znaczenie błędu niezależne od konkretnego API. */
  category?: IntegrationErrorCategory;
  /** Czas oczekiwania przekazany w nagłówku `Retry-After`. */
  retryAfterSeconds?: number | null;
};

/** Błąd odpowiedzi otrzymanej ze Spotify Web API. */
class SpotifyApiError extends IntegrationApiError {
  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param status - Status odpowiedzi Spotify albo status zastępczy transportu.
   * @param data - Dane odpowiedzi lub pierwotna przyczyna błędu transportu.
   * @param options - Kategoria błędu i opcjonalny czas ponowienia.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null,
    options: SpotifyApiErrorOptions = {}
  ) {
    super("spotify", message, {
      category: options.category ?? classifySpotifyError(status),
      upstreamStatus: status,
      retryAfterSeconds: options.retryAfterSeconds,
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
