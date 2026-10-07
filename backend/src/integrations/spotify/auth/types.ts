import type { RequestScheduler } from "@integrations/request-scheduler.js";

/**
 * Określa zależności i ustawienia klienta Spotify Accounts API.
 *
 * @property fetchImpl - Implementacja `fetch`, którą można zastąpić w testach.
 * @property tokenUrl - Adres endpointu wydającego tokeny.
 * @property basicAuthHeader - Nagłówek utworzony z Client ID i Client Secret.
 * @property redirectUri - Adres callbacku zarejestrowany w panelu Spotify.
 * @property requestTimeoutMs - Maksymalny czas oczekiwania na odpowiedź.
 * @property scheduler - Opcjonalny scheduler serializujący operacje tokenowe.
 */
type SpotifyAuthConfiguration = {
  fetchImpl?: typeof globalThis.fetch;
  tokenUrl?: string;
  basicAuthHeader?: string;
  redirectUri?: string;
  requestTimeoutMs?: number;
  scheduler?: RequestScheduler;
};

/** Rodzaj technicznej awarii podczas komunikacji ze Spotify Accounts. */
type SpotifyAuthErrorKind =
  "oauth" | "network" | "timeout" | "invalid-response";

/** Dane potrzebne do sklasyfikowania błędu Spotify Accounts. */
type SpotifyAuthApiErrorOptions = {
  /** Ogólna kategoria awarii. */
  kind: SpotifyAuthErrorKind;
  /** Status HTTP zwrócony przez Spotify, jeśli odpowiedź została odebrana. */
  upstreamStatus?: number | null;
  /** Kod OAuth z pola `error`, na przykład `invalid_grant`. */
  oauthCode?: string | null;
  /** Liczba sekund przekazana przez Spotify w nagłówku `Retry-After`. */
  retryAfterSeconds?: number | null;
  /** Oryginalne dane odpowiedzi przydatne w diagnostyce backendu. */
  data?: unknown;
  /** Pierwotny wyjątek połączenia, który nie jest zwracany klientowi API. */
  cause?: unknown;
};

/** Poprawnie odczytany błąd zgodny z formatem OAuth Spotify. */
type SpotifyOAuthErrorResponse = {
  /** Kod błędu przeznaczony do obsługi programistycznej. */
  code: string;
  /** Opcjonalny opis błędu przeznaczony dla człowieka. */
  description: string | null;
};

/** Parametry wymiany kodu autoryzacyjnego na tokeny. */
type SpotifyAuthorizationCodeRequest = {
  /** Grant OAuth używany podczas pierwszej wymiany kodu. */
  grant_type: "authorization_code";
  /** Jednorazowy kod otrzymany w callbacku Spotify. */
  code: string;
  /** Callback identyczny z adresem użytym podczas rozpoczęcia logowania. */
  redirect_uri: string;
};

/** Parametry odświeżenia tokenu dostępu. */
type SpotifyRefreshTokenRequest = {
  /** Grant OAuth używany podczas odświeżania tokenu. */
  grant_type: "refresh_token";
  /** Refresh token zapisany podczas wcześniejszej autoryzacji. */
  refresh_token: string;
};

/** Parametry obsługiwane przez endpoint tokenowy Spotify. */
type SpotifyTokenRequest =
  SpotifyAuthorizationCodeRequest | SpotifyRefreshTokenRequest;

/** Wspólne pola poprawnej odpowiedzi tokenowej Spotify. */
type SpotifyTokenResponse = {
  /** Token używany do autoryzowania zapytań do Spotify Web API. */
  access_token: string;
  /** Schemat autoryzacji wymagany w nagłówku HTTP. */
  token_type: "Bearer";
  /** Lista przyznanych uprawnień oddzielonych spacjami. */
  scope: string;
  /** Czas ważności access tokenu wyrażony w sekundach. */
  expires_in: number;
  /** Nowy refresh token, jeśli Spotify przeprowadzi jego rotację. */
  refresh_token?: string;
};

/** Odpowiedź pierwszej wymiany kodu, która zawiera refresh token. */
type SpotifyAuthorizationTokenResponse = SpotifyTokenResponse & {
  /** Refresh token wymagany do późniejszego odnawiania dostępu. */
  refresh_token: string;
};

/** Operacje udostępniane przez klienta Spotify Accounts API. */
type SpotifyAuthClient = {
  /** Wymienia jednorazowy kod autoryzacyjny na tokeny użytkownika. */
  exchangeAuthorizationCode(
    code: string
  ): Promise<SpotifyAuthorizationTokenResponse>;
  /** Pobiera nowy access token przy użyciu istniejącego refresh tokenu. */
  refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse>;
};

export type {
  SpotifyAuthConfiguration,
  SpotifyAuthErrorKind,
  SpotifyAuthApiErrorOptions,
  SpotifyOAuthErrorResponse,
  SpotifyAuthorizationCodeRequest,
  SpotifyRefreshTokenRequest,
  SpotifyTokenRequest,
  SpotifyTokenResponse,
  SpotifyAuthorizationTokenResponse,
  SpotifyAuthClient,
};
