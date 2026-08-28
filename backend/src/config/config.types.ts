/** Zmienne środowiskowe odczytywane podczas budowania konfiguracji aplikacji. */
export type ApplicationEnvironment = {
  NODE_ENV?: string;
  PORT?: string;
  SESSION_SECRET?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REDIRECT_URI?: string;
  LASTFM_API_KEY?: string;
  LASTFM_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  LASTFM_SHARED_SECRET?: string;
  LASTFM_USER_AGENT?: string;
  SOUNDCHARTS_APP_ID?: string;
  SOUNDCHARTS_API_KEY?: string;
};
