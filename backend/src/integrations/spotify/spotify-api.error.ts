import { IntegrationApiError } from "../integration-api.error.js";

/** Błąd odpowiedzi otrzymanej ze Spotify Web API. */
class SpotifyApiError extends IntegrationApiError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null
  ) {
    super("spotify", message, status, data);
    this.name = "SpotifyApiError";
  }
}

export { SpotifyApiError };
