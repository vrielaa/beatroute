import { appConfig } from "../../../config/app.config.js";
import { SpotifyAuthApiError } from "./api-error.js";
import { getSpotifyBasicAuthHeader } from "./basic-auth.js";
import {
  describeResponseShape,
  isTimeoutError,
  parseRetryAfter,
  parseSpotifyOAuthError,
  parseSpotifyTokenResponse,
} from "./response-parser.js";
import type {
  SpotifyAuthClient,
  SpotifyAuthConfiguration,
  SpotifyAuthorizationTokenResponse,
  SpotifyTokenRequest,
  SpotifyTokenResponse,
} from "./types.js";

/**
 * Tworzy klienta obsługującego wymianę i odświeżanie tokenów Spotify.
 * Zależności konfiguracyjne można zastąpić, dzięki czemu klient nie wymaga
 * prawdziwego połączenia ze Spotify w testach.
 *
 * @param configuration - Adres tokenowy, dane autoryzacji i implementacja HTTP.
 * @returns Operacje Spotify Accounts API związane z tokenami użytkownika.
 */
function createSpotifyAuthClient({
  fetchImpl = globalThis.fetch,
  tokenUrl = "https://accounts.spotify.com/api/token",
  basicAuthHeader = getSpotifyBasicAuthHeader(),
  redirectUri = appConfig.spotify.redirectUri,
  requestTimeoutMs = 10_000,
}: SpotifyAuthConfiguration = {}): SpotifyAuthClient {
  /**
   * Wysyła formularz do endpointu tokenowego Spotify.
   *
   * @param params - Parametry wymiany kodu albo odświeżenia tokenu.
   * @returns Odpowiedź tokenowa właściwa dla wykonywanej operacji.
   * @throws {SpotifyAuthApiError} Gdy Spotify zwróci nieudany status HTTP.
   */
  async function requestToken(
    params: SpotifyTokenRequest
  ): Promise<SpotifyTokenResponse> {
    let response: Response;

    try {
      response = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(Object.entries(params)),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (cause) {
      const timedOut = isTimeoutError(cause);

      throw new SpotifyAuthApiError(
        timedOut
          ? "Spotify Accounts nie odpowiedziało w wymaganym czasie"
          : "Nie udało się połączyć ze Spotify Accounts",
        {
          kind: timedOut ? "timeout" : "network",
          cause,
        }
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch (cause) {
      throw new SpotifyAuthApiError(
        "Spotify Accounts zwróciło odpowiedź inną niż JSON",
        {
          kind: "invalid-response",
          upstreamStatus: response.status,
          retryAfterSeconds: parseRetryAfter(
            response.headers.get("retry-after")
          ),
          cause,
        }
      );
    }

    if (!response.ok) {
      const oauthError = parseSpotifyOAuthError(data);

      throw new SpotifyAuthApiError(
        oauthError?.description ??
          "Nie udało się uzyskać tokenu dostępu od Spotify",
        {
          kind: oauthError ? "oauth" : "invalid-response",
          upstreamStatus: response.status,
          oauthCode: oauthError?.code ?? null,
          retryAfterSeconds: parseRetryAfter(
            response.headers.get("retry-after")
          ),
          data,
        }
      );
    }

    return parseSpotifyTokenResponse(data);
  }

  /**
   * Wymienia jednorazowy kod callbacku OAuth na access token i refresh token.
   *
   * @param code - Kod autoryzacyjny otrzymany w callbacku Spotify.
   * @returns Tokeny oraz informacje o ich zakresie i czasie ważności.
   */
  async function exchangeAuthorizationCode(
    code: string
  ): Promise<SpotifyAuthorizationTokenResponse> {
    const tokenResponse = await requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    if (!tokenResponse.refresh_token) {
      throw new SpotifyAuthApiError(
        "Spotify Accounts nie zwróciło refresh tokenu",
        {
          kind: "invalid-response",
          upstreamStatus: 200,
          data: describeResponseShape(tokenResponse),
        }
      );
    }

    return {
      ...tokenResponse,
      refresh_token: tokenResponse.refresh_token,
    };
  }

  /**
   * Pobiera nowy access token bez ponownego logowania użytkownika.
   *
   * @param refreshToken - Aktualny refresh token zapisany w sesji.
   * @returns Nowy access token i opcjonalnie nowy refresh token.
   */
  function refreshAccessToken(
    refreshToken: string
  ): Promise<SpotifyTokenResponse> {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  return { exchangeAuthorizationCode, refreshAccessToken };
}

/** Klient korzystający z produkcyjnej konfiguracji Spotify Accounts API. */
const defaultSpotifyAuthClient = createSpotifyAuthClient();

export { createSpotifyAuthClient, defaultSpotifyAuthClient };
