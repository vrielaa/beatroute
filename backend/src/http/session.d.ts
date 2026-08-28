import "express-session";

declare module "express-session" {
  interface SessionData {
    lastfm?: {
      username: string;
    };
    spotify?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      scope: string;
      tokenType: string;
    };

    spotifyAuthState?: string;
  }
}
