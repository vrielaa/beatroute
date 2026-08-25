import { refreshAccessToken } from "../../../utils/spotify.js";
import { HttpError } from "../../../http/error-response.js";

export default async function ensureSpotifyAccessToken(req, res, next) {
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
    console.error("Błąd podczas odświeżania tokena:", error.message);
    return next(
      new HttpError(401, "SPOTIFY_SESSION_EXPIRED", "Sesja Spotify wygasła")
    );
  }
}
