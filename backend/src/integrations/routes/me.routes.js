import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  isRequestValidationError,
  MAX_ARTISTS_LIMIT,
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../spotify/spotify.validators.js";
import {
  getCurrentUserProfile,
  getCurrentUserTopArtists,
  getCurrentUserTopTracks,
  SpotifyApiError,
} from "../spotify/spotify.service.js";

const router = Router();

router.get("/top-tracks", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
      maxLimit: MAX_TRACKS_LIMIT,
    });

    const data = await getCurrentUserTopTracks(
      req.session.spotify.accessToken,
      {
        limit,
        timeRange,
      }
    );

    res.json(data);
  } catch (error) {
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof SpotifyApiError) {
      return res.status(error.status).json(error.data);
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

    const data = await getCurrentUserTopArtists(
      req.session.spotify.accessToken,
      { limit, timeRange }
    );

    res.json(data);
  } catch (error) {
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof SpotifyApiError) {
      return res.status(error.status).json(error.data);
    }

    console.error("Top artists error:", error);
    res.status(500).json({ message: "Nie udało się pobrać top artists" });
  }
});

router.get("/profile", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const data = await getCurrentUserProfile(req.session.spotify.accessToken);

    res.json(data);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      return res.status(error.status).json(error.data);
    }

    console.error("Me error:", error);
    res
      .status(500)
      .json({ message: "Nie udało się pobrać informacji o użytkowniku" });
  }
});

export default router;
