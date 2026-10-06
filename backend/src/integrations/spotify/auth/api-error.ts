import { IntegrationApiError } from "../../integration-api.error.js";
import type { IntegrationErrorCategory } from "../../integration-api.error.js";
import type { SpotifyAuthApiErrorOptions } from "./types.js";

/** Błąd odpowiedzi lub komunikacji ze Spotify Accounts API. */
class SpotifyAuthApiError extends IntegrationApiError {
  /** Kategoria pozwalająca odróżnić OAuth, sieć, timeout i błędną odpowiedź. */
  public readonly kind;
  /** Kod z pola `error` odpowiedzi OAuth, jeśli Spotify go przesłało. */
  public readonly oauthCode;
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

    super("spotify-auth", message, {
      category: classifySpotifyAuthError(kind, upstreamStatus, oauthCode),
      upstreamStatus,
      upstreamCode: oauthCode,
      retryAfterSeconds,
      details: data,
    });
    this.name = "SpotifyAuthApiError";
    this.kind = kind;
    this.oauthCode = oauthCode;
    this.data = data;
    this.originalCause = cause;
  }
}

/** Nadaje błędowi Spotify Accounts neutralne znaczenie integracyjne. */
function classifySpotifyAuthError(
  kind: SpotifyAuthApiErrorOptions["kind"],
  upstreamStatus: number | null,
  oauthCode: string | null
): IntegrationErrorCategory {
  if (kind === "network" || kind === "timeout" || kind === "invalid-response") {
    return kind;
  }

  if (
    oauthCode === "invalid_client" ||
    oauthCode === "unauthorized_client" ||
    oauthCode === "invalid_scope"
  ) {
    return "configuration";
  }

  if (upstreamStatus === 429) {
    return "rate-limited";
  }

  if (upstreamStatus !== null && upstreamStatus >= 500) {
    return "unavailable";
  }

  return "upstream-error";
}

export { SpotifyAuthApiError };
