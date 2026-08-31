import type { ApplicationEnvironment } from "./config.types.js";

/** Uprawnienia Spotify wymagane przez funkcje dostępne w aplikacji. */
const SPOTIFY_SCOPES = [
  "user-top-read",
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "playlist-modify-private",
];

/**
 * Buduje konfigurację aplikacji ze zmiennych środowiskowych.
 * Brakujące wartości tekstowe pozostawia jako puste, aby wspólna walidacja
 * konfiguracji mogła zgłosić czytelny błąd podczas uruchamiania serwera.
 *
 * @param env - Zmienne środowiskowe procesu albo ich zamienniki używane w testach.
 * @returns Konfiguracja serwera oraz zewnętrznych integracji.
 */
function createAppConfig(env: ApplicationEnvironment = {}) {
  return {
    server: {
      port: Number(env.PORT ?? 3000),
      frontendUrl: env.FRONTEND_URL ?? "",
      sessionSecret: env.SESSION_SECRET ?? "",
      isProduction: env.NODE_ENV === "production",
    },
    spotify: {
      clientId: env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: env.SPOTIFY_CLIENT_SECRET ?? "",
      redirectUri: env.SPOTIFY_REDIRECT_URI ?? "",
      scopes: SPOTIFY_SCOPES,
    },
    lastfm: {
      apiRoot: "https://ws.audioscrobbler.com/2.0/",
      authUrl: "https://www.last.fm/api/auth/",
      apiKey: env.LASTFM_API_KEY ?? "",
      sharedSecret: env.LASTFM_SHARED_SECRET ?? "",
      redirectUri: env.LASTFM_REDIRECT_URI ?? "",
      userAgent: env.LASTFM_USER_AGENT || "BeatRoute/1.0",
    },
    reccoBeats: {
      baseUrl: "https://api.reccobeats.com",
    },
    soundcharts: {
      baseUrl: "https://customer.api.soundcharts.com",
      appId: env.SOUNDCHARTS_APP_ID ?? "",
      apiKey: env.SOUNDCHARTS_API_KEY ?? "",
    },
  };
}

/** Konfiguracja używana przez uruchomioną aplikację. */
const appConfig = createAppConfig(process.env);

export { SPOTIFY_SCOPES, createAppConfig, appConfig };
