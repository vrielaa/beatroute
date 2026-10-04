import { SpotifyAuthApiError } from "@integrations/spotify/auth/api-error.js";
import { createErrorResponse } from "./error-response.js";
import type { MappedHttpError } from "./types.js";

/** Mapuje techniczny błąd Spotify Accounts na bezpieczną odpowiedź API. */
function mapSpotifyAuthError(error: SpotifyAuthApiError): MappedHttpError {
  const details = {
    integration: error.integration,
    upstreamStatus: error.upstreamStatus,
    ...(error.oauthCode === null ? {} : { oauthCode: error.oauthCode }),
    ...(error.retryAfterSeconds === null
      ? {}
      : { retryAfterSeconds: error.retryAfterSeconds }),
  };

  if (
    error.oauthCode === "invalid_client" ||
    error.oauthCode === "unauthorized_client" ||
    error.oauthCode === "invalid_scope"
  ) {
    return {
      status: 503,
      body: createErrorResponse(
        "SPOTIFY_CONFIGURATION_ERROR",
        "Integracja Spotify jest nieprawidłowo skonfigurowana",
        details
      ),
    };
  }

  if (
    error.oauthCode === "invalid_request" ||
    error.oauthCode === "unsupported_grant_type"
  ) {
    return {
      status: 500,
      body: createErrorResponse(
        "SPOTIFY_AUTH_REQUEST_ERROR",
        "Backend utworzył nieprawidłowe żądanie autoryzacyjne Spotify",
        details
      ),
    };
  }

  if (error.upstreamStatus === 429) {
    return {
      status: 429,
      body: createErrorResponse(
        "SPOTIFY_RATE_LIMITED",
        "Przekroczono limit zapytań Spotify",
        details
      ),
      ...(error.retryAfterSeconds === null
        ? {}
        : { headers: { "Retry-After": String(error.retryAfterSeconds) } }),
    };
  }

  if (error.kind === "timeout") {
    return {
      status: 504,
      body: createErrorResponse(
        "SPOTIFY_AUTH_TIMEOUT",
        "Spotify nie odpowiedziało w wymaganym czasie",
        details
      ),
    };
  }

  if (
    error.oauthCode === "server_error" ||
    error.oauthCode === "temporarily_unavailable" ||
    (error.upstreamStatus !== null && error.upstreamStatus >= 500)
  ) {
    return {
      status: 503,
      body: createErrorResponse(
        "SPOTIFY_AUTH_UNAVAILABLE",
        "Integracja Spotify jest tymczasowo niedostępna",
        details
      ),
    };
  }

  if (error.kind === "network") {
    return {
      status: 502,
      body: createErrorResponse(
        "SPOTIFY_AUTH_UNAVAILABLE",
        "Nie udało się połączyć ze Spotify",
        details
      ),
    };
  }

  if (error.kind === "invalid-response") {
    return {
      status: 502,
      body: createErrorResponse(
        "SPOTIFY_AUTH_INVALID_RESPONSE",
        "Spotify zwróciło nieprawidłową odpowiedź",
        details
      ),
    };
  }

  return {
    status: error.upstreamStatus ?? 502,
    body: createErrorResponse("SPOTIFY_AUTH_API_ERROR", error.message, details),
  };
}

export { mapSpotifyAuthError };
