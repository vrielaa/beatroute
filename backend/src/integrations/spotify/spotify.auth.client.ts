import { appConfig } from "../../config/app.config.js";
import { getSpotifyBasicAuthHeader } from "../../utils/spotify-basic-auth.js";
import type {
  SpotifyAuthClient,
  SpotifyAuthConfiguration,
  SpotifyAuthorizationTokenResponse,
  SpotifyTokenRequest,
  SpotifyTokenResponse,
} from "./spotify.auth.types.js";

/**
 * Błąd zwracany przez Spotify Accounts API podczas pobierania tokenów.
 * Zachowuje status HTTP i oryginalne dane odpowiedzi do centralnego mapowania
 * błędów aplikacji.
 */
class SpotifyAuthApiError extends Error {
  /** Status HTTP odpowiedzi Spotify. */
  public readonly status: number;
  /** Oryginalne dane odpowiedzi błędu albo `null`. */
  public readonly data: unknown | null;

  /**
   * @param message - Czytelny komunikat błędu.
   * @param status - Status HTTP odpowiedzi Spotify.
   * @param data - Oryginalne dane odpowiedzi błędu.
   */
  constructor(message: string, status: number, data: unknown | null = null) {
    super(message);
    this.name = "SpotifyAuthApiError";
    this.status = status;
    this.data = data;
  }
}

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
}: SpotifyAuthConfiguration = {}): SpotifyAuthClient {
  /**
   * Wysyła formularz do endpointu tokenowego Spotify.
   *
   * @param params - Parametry wymiany kodu albo odświeżenia tokenu.
   * @returns Odpowiedź tokenowa właściwa dla wykonywanej operacji.
   * @throws {SpotifyAuthApiError} Gdy Spotify zwróci nieudany status HTTP.
   */
  async function requestToken<T extends SpotifyTokenResponse>(
    params: SpotifyTokenRequest
  ): Promise<T> {
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(Object.entries(params)),
    });
    const data: unknown = await response.json();

    if (!response.ok) {
      throw new SpotifyAuthApiError(
        getSpotifyAuthErrorMessage(data) ??
          "Nie udało się uzyskać tokenu dostępu od Spotify",
        response.status,
        data
      );
    }

    return data as T;
  }

  /**
   * Wymienia jednorazowy kod callbacku OAuth na access token i refresh token.
   *
   * @param code - Kod autoryzacyjny otrzymany w callbacku Spotify.
   * @returns Tokeny oraz informacje o ich zakresie i czasie ważności.
   */
  function exchangeAuthorizationCode(
    code: string
  ): Promise<SpotifyAuthorizationTokenResponse> {
    return requestToken<SpotifyAuthorizationTokenResponse>({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
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
    return requestToken<SpotifyTokenResponse>({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  return { exchangeAuthorizationCode, refreshAccessToken };
}

/**
 * Bezpiecznie odczytuje opis błędu z odpowiedzi Spotify o nieznanym kształcie.
 *
 * @param data - Dane JSON zwrócone przez Spotify Accounts API.
 * @returns Opis błędu albo `null`, gdy odpowiedź go nie zawiera.
 */
function getSpotifyAuthErrorMessage(data: unknown): string | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("error_description" in data)
  ) {
    return null;
  }

  const errorDescription = data.error_description;

  return typeof errorDescription === "string" ? errorDescription : null;
}

/** Klient korzystający z produkcyjnej konfiguracji Spotify Accounts API. */
const defaultSpotifyAuthClient = createSpotifyAuthClient();

export {
  SpotifyAuthApiError,
  createSpotifyAuthClient,
  defaultSpotifyAuthClient,
};
