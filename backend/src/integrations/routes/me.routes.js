import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  MAX_ARTISTS_LIMIT,
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../spotify/spotify.validators.js";
import {
  getCurrentUserProfile,
  getCurrentUserTopArtists,
  getCurrentUserTopTracks,
} from "../spotify/spotify.gateway.js";

const router = Router();

router.get("/top-tracks", ensureSpotifyAccessToken, async (req, res) => {
  const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
    maxLimit: MAX_TRACKS_LIMIT,
  });

  const data = await getCurrentUserTopTracks(req.session.spotify.accessToken, {
    limit,
    timeRange,
  });

  res.json(data);
});

router.get("/top-artists", ensureSpotifyAccessToken, async (req, res) => {
  const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
    maxLimit: MAX_ARTISTS_LIMIT,
  });

  const data = await getCurrentUserTopArtists(req.session.spotify.accessToken, {
    limit,
    timeRange,
  });

  res.json(data);
});

router.get("/profile", ensureSpotifyAccessToken, async (req, res) => {
  const data = await getCurrentUserProfile(req.session.spotify.accessToken);

  res.json(data);
});

export default router;
