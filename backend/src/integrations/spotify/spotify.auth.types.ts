/** Konfiguracja połączenia ze Spotify Accounts API. */
export type SpotifyAuthConfiguration = {
  /** Implementacja `fetch`, którą można zastąpić w testach. */
  fetchImpl?: typeof globalThis.fetch;
  /** Adres endpointu wydającego tokeny. */
  tokenUrl?: string;
  /** Nagłówek Basic Auth utworzony z Client ID i Client Secret. */
  basicAuthHeader?: string;
  /** Adres callbacku zarejestrowany w panelu Spotify. */
  redirectUri?: string;
};

/** Parametry wymiany kodu autoryzacyjnego na tokeny. */
export type SpotifyAuthorizationCodeRequest = {
  /** Grant OAuth używany podczas pierwszej wymiany kodu. */
  grant_type: "authorization_code";
  /** Jednorazowy kod otrzymany w callbacku Spotify. */
  code: string;
  /** Callback identyczny z adresem użytym podczas rozpoczęcia logowania. */
  redirect_uri: string;
};

/** Parametry odświeżenia tokenu dostępu. */
export type SpotifyRefreshTokenRequest = {
  /** Grant OAuth używany podczas odświeżania tokenu. */
  grant_type: "refresh_token";
  /** Refresh token zapisany podczas wcześniejszej autoryzacji. */
  refresh_token: string;
};

/** Parametry obsługiwane przez endpoint tokenowy Spotify. */
export type SpotifyTokenRequest =
  | SpotifyAuthorizationCodeRequest
  | SpotifyRefreshTokenRequest;

/** Wspólne pola poprawnej odpowiedzi tokenowej Spotify. */
export type SpotifyTokenResponse = {
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
export type SpotifyAuthorizationTokenResponse = SpotifyTokenResponse & {
  /** Refresh token wymagany do późniejszego odnawiania dostępu. */
  refresh_token: string;
};

/** Operacje udostępniane przez klienta Spotify Accounts API. */
export type SpotifyAuthClient = {
  /** Wymienia jednorazowy kod autoryzacyjny na tokeny użytkownika. */
  exchangeAuthorizationCode(
    code: string
  ): Promise<SpotifyAuthorizationTokenResponse>;
  /** Pobiera nowy access token przy użyciu istniejącego refresh tokenu. */
  refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse>;
};
