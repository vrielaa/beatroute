import "express-session";
import type { SpotifySession } from "@application/auth/types.js";
import type { PendingPlaylistSave } from "@application/playlist-generator/types.js";

declare module "express-session" {
  interface SessionData {
    lastfm?: {
      username: string;
      sessionKey: string;
    };
    spotify?: SpotifySession;
    spotifyAuthState?: string;
    lastfmAuthState?: string;
    pendingPlaylistSave?: PendingPlaylistSave;
  }
}
