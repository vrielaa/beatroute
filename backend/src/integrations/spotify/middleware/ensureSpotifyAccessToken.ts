import { refreshAccessToken } from "../../../utils/spotify.js";
import { HttpError } from "@http/error-response.js";
import type { Request, Response, NextFunction } from "express";

type SpotifyAccessTokenMiddlewareDependencies = {
  refresh: (request: Request) => Promise<void>;
  now: () => number;
};

/** Tworzy middleware pilnujące obecności i ważności tokenu Spotify. */
function createEnsureSpotifyAccessToken({
  refresh,
  now,
}: SpotifyAccessTokenMiddlewareDependencies) {
  return async function ensureSpotifyAccessToken(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    try {
      const spotifySession = req.session.spotify;

      if (!spotifySession?.accessToken) {
        return next(
          new HttpError(
            401,
            "SPOTIFY_AUTH_REQUIRED",
            "Użytkownik nie jest zalogowany do Spotify"
          )
        );
      }

      const isExpired =
        !spotifySession.expiresAt || now() >= spotifySession.expiresAt - 60_000;

      if (isExpired) {
        await refresh(req);
      }

      next();
    } catch {
      return next(
        new HttpError(401, "SPOTIFY_SESSION_EXPIRED", "Sesja Spotify wygasła")
      );
    }
  };
}

const ensureSpotifyAccessToken = createEnsureSpotifyAccessToken({
  refresh: refreshAccessToken,
  now: Date.now,
});

export { createEnsureSpotifyAccessToken };
export type { SpotifyAccessTokenMiddlewareDependencies };
export default ensureSpotifyAccessToken;
