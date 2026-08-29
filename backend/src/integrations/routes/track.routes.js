import { Router } from "express";
import { getTrackAudioFeaturesBySpotifyId } from "../../integrations/soundcharts/soundcharts.service.js";
import { calculateAudioStats } from "../../integrations/reccobeats/reccobeats.stats.js";
import { reccoBeatsService } from "../../integrations/reccobeats/reccobeats.service.js";
import {
  MAX_TRACKS_LIMIT,
  parseTrackIds,
} from "../spotify/spotify.validators.js";

const router = Router();

router.get("/:spotifyTrackId/audio-features", async (req, res) => {
  const data = await getTrackAudioFeaturesBySpotifyId(
    req.params.spotifyTrackId,
  );
  res.json(data);
});

router.post("/audio-features", async (req, res) => {
  const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

  const results = await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(
    trackIds,
  );

  res.json({ audio_features: results });
});

// returns object with average values of audio features for given Spotify track IDs, based on ReccoBeats data, and count of valid tracks found
router.post("/audio-stats", async (req, res) => {
  const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

  const results = await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(
    trackIds,
  );
  const foundTracksCount = results.filter((result) => !result.error).length;
  let stats = calculateAudioStats(results);
  stats = {
    ...stats,
    foundTracksCount,
    totalTracksCount: trackIds.length,
  };

  res.json(stats);
});
export default router;
