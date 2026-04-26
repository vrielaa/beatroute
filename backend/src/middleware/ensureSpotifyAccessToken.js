import { refreshAccessToken } from "../utils/spotify.js";

export default async function ensureSpotifyAccessToken(req, res, next) {
  try {
    const spotifySession = req.session.spotify;

    if (!spotifySession?.accessToken) {
      return res
        .status(401)
        .json({ message: "Użytkownik nie jest zalogowany do Spotify" });
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
    return res.status(401).json({ message: "Sesja Spotify wygasła" });
  }
}
