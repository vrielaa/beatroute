import { Router } from "express";
import { getTrackAudioFeaturesBySpotifyId } from "../../integrations/soundcharts/soundcharts.service.js";
import { calculateAudioStats } from "../../integrations/reccobeats/reccobeats.stats.js";
import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";
import {
  isRequestValidationError,
  MAX_TRACKS_LIMIT,
  parseTrackIds,
} from "../spotify/spotify.validators.js";

const router = Router();

router.get("/:spotifyTrackId/audio-features", async (req, res) => {
  try {
    const data = await getTrackAudioFeaturesBySpotifyId(
      req.params.spotifyTrackId
    );
    res.json(data);
  } catch (error) {
    console.error("Soundcharts audio features error:", error);
    res
      .status(500)
      .json({ message: "Nie udało się pobrać audio features z Soundcharts" });
  }
});

router.post("/audio-features", async (req, res) => {
  try {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const results = await getManyTrackAudioFeaturesBySpotifyIds(trackIds);

    res.json({ audio_features: results });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    console.error("ReccoBeats audio features bulk error:", error);
    res.status(500).json({
      message: "Nie udało się pobrać audio features z ReccoBeats",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// returns object with average values of audio features for given Spotify track IDs, based on ReccoBeats data, and count of valid tracks found
router.post("/audio-stats", async (req, res) => {
  try {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const results = await getManyTrackAudioFeaturesBySpotifyIds(trackIds);
    const foundTracksCount = results.filter((result) => !result.error).length;
    let stats = calculateAudioStats(results);
    stats = {
      ...stats,
      foundTracksCount: foundTracksCount,
      totalTracksCount: trackIds.length,
    };

    res.json(stats);
  } catch (error) {
    if (isRequestValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    console.error("ReccoBeats audio stats error:", error);
    res.status(500).json({
      message: "Nie udało się pobrać audio stats z ReccoBeats",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
export default router;
