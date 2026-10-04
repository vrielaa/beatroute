/** Dane połączenia Spotify przechowywane w sesji użytkownika. */
type SpotifySession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
};

/** Dane nowego tokenu zwracane przez port odświeżania Spotify. */
type RefreshedSpotifyToken = {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope: string;
  tokenType: string;
};

/** Port odnawiający dostęp bez ujawniania szczegółów Spotify Accounts API. */
type SpotifyTokenRefresher = (
  refreshToken: string
) => Promise<RefreshedSpotifyToken>;

export type { SpotifySession, RefreshedSpotifyToken, SpotifyTokenRefresher };
