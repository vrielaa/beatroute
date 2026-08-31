import { refreshAccessToken } from "../../../utils/spotify.js";
import { HttpError } from "@http/error-response.js";
import type { Request, Response, NextFunction } from "express";

async function ensureSpotifyAccessToken(
  req: Request,
  res: Response,
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
      !spotifySession.expiresAt ||
      Date.now() >= spotifySession.expiresAt - 60_000;

    if (isExpired) {
      await refreshAccessToken(req);
    }

    next();
  } catch (error) {
    if (error instanceof Error) {
      console.error("Błąd podczas odświeżania tokena:", error.message);
    } else {
      console.error("Nieznany błąd podczas odświeżania tokena:", error);
    }

    return next(
      new HttpError(401, "SPOTIFY_SESSION_EXPIRED", "Sesja Spotify wygasła")
    );
  }
}

export default ensureSpotifyAccessToken;
