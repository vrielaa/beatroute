import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import { getTrackAudioFeaturesBySpotifyId } from "../../integrations/soundcharts/soundcharts.service.js";

const router = Router();

router.get('/:spotifyTrackId/audio-features', async (req, res) => {
  try {
    const data = await getTrackAudioFeaturesBySpotifyId(req.params.spotifyTrackId);
    res.json(data);
  } catch (error) {
    console.error('Soundcharts audio features error:', error);
    res.status(500).json({ message: 'Nie udało się pobrać audio features z Soundcharts' });
  }
});

router.post('/audio-features', async (req, res) => {
  try {
    const { trackIds } = req.body;

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({
        message: 'trackIds musi być niepustą tablicą',
      });
    }

    const results = await Promise.all(
      trackIds.map((trackId) => getTrackAudioFeaturesBySpotifyId(trackId))
    );

    res.json({ audio_features: results });
  } catch (error) {
    console.error('Soundcharts audio features error:', error);
    res.status(500).json({
      message: 'Nie udało się pobrać audio features z Soundcharts',
    });
  }
});

export default router;