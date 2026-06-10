import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";

const router = Router();

const headers = (req) => ({
  Authorization: `Bearer ${req.session.spotify.accessToken}`,
});

router.get("/top-tracks", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const limit = String(req.query.limit || 10);
    const timeRange = String(req.query.time_range || "medium_term");

    const params = new URLSearchParams({
      limit,
      time_range: timeRange,
    });

    const spotifyResponse = await fetch(
      `https://api.spotify.com/v1/me/top/tracks?${params.toString()}`,
      { headers: headers(req) }
    );

    const data = await spotifyResponse.json();

    if (!spotifyResponse.ok) {
      return res.status(spotifyResponse.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("Top tracks error:", error);
    res.status(500).json({ message: "Nie udało się pobrać top tracks" });
  }
});

router.get("/top-artists", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const limit = String(req.query.limit || 10);
    const timeRange = String(req.query.time_range || "medium_term");

    const params = new URLSearchParams({
      limit,
      time_range: timeRange,
    });

    const spotifyResponse = await fetch(
      `https://api.spotify.com/v1/me/top/artists?${params.toString()}`,
      { headers: headers(req) }
    );

    const data = await spotifyResponse.json();

    console.log("Spotify top artists response:", data);

    if (!spotifyResponse.ok) {
      return res.status(spotifyResponse.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("Top artists error:", error);
    res.status(500).json({ message: "Nie udało się pobrać top artists" });
  }
});

router.get("/profile", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const spotifyResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: headers(req),
    });

    const data = await spotifyResponse.json();

    if (!spotifyResponse.ok) {
      return res.status(spotifyResponse.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("Me error:", error);
    res
      .status(500)
      .json({ message: "Nie udało się pobrać informacji o użytkowniku" });
  }
});

export default router;
