import { IntegrationApiError } from "../../integration-api.error.js";
import type { SpotifyAuthApiErrorOptions } from "./types.js";

/** Błąd odpowiedzi lub komunikacji ze Spotify Accounts API. */
class SpotifyAuthApiError extends IntegrationApiError {
  /** Kategoria pozwalająca odróżnić OAuth, sieć, timeout i błędną odpowiedź. */
  public readonly kind;
  /** Kod z pola `error` odpowiedzi OAuth, jeśli Spotify go przesłało. */
  public readonly oauthCode;
  /** Zalecany czas oczekiwania przed ponowieniem żądania. */
  public readonly retryAfterSeconds;
  /** Oryginalna odpowiedź Spotify używana wyłącznie do diagnostyki backendu. */
  public readonly data;
  /** Pierwotny wyjątek połączenia, który nie jest ujawniany klientowi API. */
  public readonly originalCause;

  constructor(message: string, options: SpotifyAuthApiErrorOptions) {
    const {
      kind,
      upstreamStatus = null,
      oauthCode = null,
      retryAfterSeconds = null,
      data = null,
      cause = null,
    } = options;

    super("spotify-auth", message, upstreamStatus, data);
    this.name = "SpotifyAuthApiError";
    this.kind = kind;
    this.oauthCode = oauthCode;
    this.retryAfterSeconds = retryAfterSeconds;
    this.data = data;
    this.originalCause = cause;
  }
}

export { SpotifyAuthApiError };
