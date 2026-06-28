import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  isRequestValidationError,
  MAX_ARTISTS_LIMIT,
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../spotify/spotify.validators.js";

const router = Router();

const headers = (req) => ({
  Authorization: `Bearer ${req.session.spotify.accessToken}`,
});

router.get("/top-tracks", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
      maxLimit: MAX_TRACKS_LIMIT,
    });

    const params = new URLSearchParams({
      limit: String(limit),
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
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    console.error("Top tracks error:", error);
    res.status(500).json({ message: "Nie udało się pobrać top tracks" });
  }
});

router.get("/top-artists", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
      maxLimit: MAX_ARTISTS_LIMIT,
    });

    const params = new URLSearchParams({
      limit: String(limit),
      time_range: timeRange,
    });

    const spotifyResponse = await fetch(
      `https://api.spotify.com/v1/me/top/artists?${params.toString()}`,
      { headers: headers(req) }
    );

    const data = await spotifyResponse.json();

    if (!spotifyResponse.ok) {
      return res.status(spotifyResponse.status).json(data);
    }

    res.json(data);
  } catch (error) {
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

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
