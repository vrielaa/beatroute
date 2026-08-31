import { IntegrationApiError } from "../integration-api.error.js";

/** Błąd odpowiedzi lub komunikacji ze Spotify Accounts API. */
class SpotifyAuthApiError extends IntegrationApiError {
  /** Status HTTP odpowiedzi Spotify Accounts. */
  public readonly status: number;
  /** Oryginalne dane błędu zwrócone przez usługę. */
  public readonly data: unknown | null;

  constructor(message: string, status: number, data: unknown | null = null) {
    super("spotify-auth", message, status, data);
    this.name = "SpotifyAuthApiError";
    this.status = status;
    this.data = data;
  }
}

export { SpotifyAuthApiError };
