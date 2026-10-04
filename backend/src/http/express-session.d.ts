import "express-session";
import type { SpotifySession } from "@application/auth/types.js";

declare module "express-session" {
  interface SessionData {
    lastfm?: {
      username: string;
      sessionKey: string;
    };
    spotify?: SpotifySession;
    spotifyAuthState?: string;
    lastfmAuthState?: string;
  }
}
