import { Router } from "express";
import ensureLastfmSession from "../lastfm/middleware/ensureLastfmSession.js";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  getArtistGenreDistribution,
  getLastfmMe,
  getLastfmTrackInfo,
  getSpotifyTrackLastfmInfo,
} from "../lastfm/lastfm.controller.js";

const router = Router();

router.get("/me", ensureLastfmSession, getLastfmMe);

router.get("/track-info", getLastfmTrackInfo);

router.post(
  "/artist-genres",
  ensureSpotifyAccessToken,
  getArtistGenreDistribution
);

router.get(
  "/spotify-tracks/:spotifyTrackId",
  ensureSpotifyAccessToken,
  getSpotifyTrackLastfmInfo
);

export default router;
