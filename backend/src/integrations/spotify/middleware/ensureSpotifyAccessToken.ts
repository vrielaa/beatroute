import { refreshAccessToken } from "@application/auth/refresh-spotify-session.js";
import { HttpError } from "@http/errors/http-error.js";
import { SpotifyReauthorizationRequiredError } from "../auth/reauthorization-required.error.js";
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
    } catch (error) {
      if (error instanceof SpotifyReauthorizationRequiredError) {
        delete req.session.spotify;

        return next(
          new HttpError(
            401,
            "SPOTIFY_REAUTH_REQUIRED",
            "Połącz ponownie konto Spotify"
          )
        );
      }

      return next(error);
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
