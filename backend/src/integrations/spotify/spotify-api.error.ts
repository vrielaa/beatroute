import { IntegrationApiError } from "../integration-api.error.js";
import type { IntegrationErrorCategory } from "../integration-api.error.js";

/**
 * Dodatkowe informacje opisujące błąd Spotify Web API.
 *
 * @property category - Znaczenie błędu niezależne od konkretnego API.
 * @property retryAfterSeconds - Czas oczekiwania przekazany w nagłówku
 * `Retry-After` albo pozostały czas lokalnej pauzy.
 * @property upstreamStatus - Status odpowiedzi źródłowej; domyślnie `status`.
 * Jawne `null` oznacza odmowę lokalną, bez nowej odpowiedzi Spotify.
 */
type SpotifyApiErrorOptions = {
  category?: IntegrationErrorCategory;
  retryAfterSeconds?: number | null;
  upstreamStatus?: number | null;
};

/** Błąd odpowiedzi Spotify Web API, transportu albo lokalnej pauzy zapytań. */
class SpotifyApiError extends IntegrationApiError {
  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param status - Status odpowiedzi Spotify albo status zastępczy transportu lub pauzy.
   * @param data - Dane odpowiedzi lub pierwotna przyczyna błędu transportu.
   * @param options - Kategoria, czas ponowienia i opcjonalny status źródłowy.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null,
    options: SpotifyApiErrorOptions = {}
  ) {
    super("spotify", message, {
      category: options.category ?? classifySpotifyError(status),
      upstreamStatus:
        options.upstreamStatus === undefined ? status : options.upstreamStatus,
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
