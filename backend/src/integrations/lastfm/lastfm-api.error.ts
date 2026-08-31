import { IntegrationApiError } from "../integration-api.error.js";

/** Błąd odpowiedzi lub komunikacji z API Last.fm. */
class LastfmApiError extends IntegrationApiError {
  /** Kod błędu zdefiniowany przez Last.fm albo `null` dla błędu transportu. */
  public readonly code: number | null;

  constructor(message: string, code: number | null = null) {
    super("lastfm", message, null, { lastfmCode: code });
    this.name = "LastfmApiError";
    this.code = code;
  }
}

export { LastfmApiError };
