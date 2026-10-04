import { SpotifyAuthApiError } from "./api-error.js";
import type {
  SpotifyOAuthErrorResponse,
  SpotifyTokenResponse,
} from "./types.js";

/** Bezpiecznie odczytuje kod i opis OAuth z odpowiedzi Spotify. */
function parseSpotifyOAuthError(
  data: unknown
): SpotifyOAuthErrorResponse | null {
  if (!isRecord(data) || typeof data.error !== "string" || !data.error.trim()) {
    return null;
  }

  const description =
    typeof data.error_description === "string" && data.error_description.trim()
      ? data.error_description
      : null;

  return { code: data.error, description };
}

/** Sprawdza i normalizuje poprawną odpowiedź tokenową Spotify. */
function parseSpotifyTokenResponse(data: unknown): SpotifyTokenResponse {
  if (
    !isRecord(data) ||
    typeof data.access_token !== "string" ||
    !data.access_token.trim() ||
    data.token_type !== "Bearer" ||
    typeof data.scope !== "string" ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0 ||
    (data.refresh_token !== undefined &&
      (typeof data.refresh_token !== "string" || !data.refresh_token.trim()))
  ) {
    throw new SpotifyAuthApiError(
      "Spotify Accounts zwróciło nieprawidłową odpowiedź tokenową",
      {
        kind: "invalid-response",
        upstreamStatus: 200,
        data: describeResponseShape(data),
      }
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_in: data.expires_in,
    ...(typeof data.refresh_token === "string"
      ? { refresh_token: data.refresh_token }
      : {}),
  };
}

/** Odczytuje liczbę sekund z nagłówka `Retry-After`. */
function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const seconds = Number(value);

  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** Rozpoznaje błąd przerwania żądania spowodowany timeoutem. */
function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/** Opisuje format odpowiedzi bez zapisywania potencjalnych tokenów w logach. */
function describeResponseShape(data: unknown): {
  receivedType: string;
  receivedFields: string[];
} {
  if (!isRecord(data)) {
    return {
      receivedType: data === null ? "null" : typeof data,
      receivedFields: [],
    };
  }

  return {
    receivedType: "object",
    receivedFields: Object.keys(data),
  };
}

/** Sprawdza, czy wartość jest obiektem możliwym do bezpiecznego odczytu. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export {
  parseSpotifyOAuthError,
  parseSpotifyTokenResponse,
  parseRetryAfter,
  isTimeoutError,
  describeResponseShape,
};
