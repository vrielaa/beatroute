import { Router } from "express";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import { getTrackAudioFeaturesBySpotifyId } from "../../integrations/soundcharts/soundcharts.service.js";
import { calculateAudioStats } from "../../integrations/reccobeats/reccobeats.stats.js";
import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";

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

    console.log('[POST /api/tracks/audio-features] req.body:', req.body);

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({
        message: 'trackIds musi być niepustą tablicą',
      });
    }

    const results = await getManyTrackAudioFeaturesBySpotifyIds(trackIds);

    res.json({ audio_features: results });
  } catch (error) {
    console.error('ReccoBeats audio features bulk error:', error);
    res.status(500).json({
      message: 'Nie udało się pobrać audio features z ReccoBeats',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/audio-stats', async (req, res) => {
  try {
    const { trackIds } = req.body;

    console.log('[POST /api/tracks/audio-stats] req.body:', req.body);

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({
        message: 'trackIds musi być niepustą tablicą',
      });
    }

    const results = await getManyTrackAudioFeaturesBySpotifyIds(trackIds);
    const stats = calculateAudioStats(results);

    console.log('[POST /api/tracks/audio-stats] stats:', stats);

    res.json(stats);
  } catch (error) {
    console.error('ReccoBeats audio stats error:', error);
    res.status(500).json({
      message: 'Nie udało się pobrać audio stats z ReccoBeats',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
//souncharts
// router.post('/audio-features', async (req, res) => {
//   try {
//     const { trackIds } = req.body;

//     if (!Array.isArray(trackIds) || trackIds.length === 0) {
//       return res.status(400).json({
//         message: 'trackIds musi być niepustą tablicą',
//       });
//     }

//     const results = await Promise.all(
//       trackIds.map((trackId) => getTrackAudioFeaturesBySpotifyId(trackId))
//     );

//     res.json({ audio_features: results });
//   } catch (error) {
//     console.error('Soundcharts audio features error:', error);
//     res.status(500).json({
//       message: 'Nie udało się pobrać audio features z Soundcharts',
//     });
//   }
// });

// router.post('/audio-stats', async (req, res) => {
//   try {
//     const { trackIds } = req.body;

//     if (!Array.isArray(trackIds) || trackIds.length === 0) {
//       return res.status(400).json({
//         message: 'trackIds musi być niepustą tablicą',
//       });
//     }

//     const results = await Promise.all(
//       trackIds.map((trackId) => getTrackAudioFeaturesBySpotifyId(trackId))
//     );

//     const validTracks = results.filter(Boolean);

//     const getAverage = (key) => {
//       const values = validTracks
//         .map((track) => track[key])
//         .filter((value) => typeof value === 'number');

//       if (!values.length) {
//         return null;
//       }

//       const sum = values.reduce((acc, value) => acc + value, 0);
//       return sum / values.length;
//     };

//     res.json({
//       trackCount: validTracks.length,
//       averageBpm: getAverage('tempo') ? Math.round(getAverage('tempo')) : null,
//       averageEnergy: getAverage('energy'),
//       averageDanceability: getAverage('danceability'),
//       averageValence: getAverage('valence'),
//       averageAcousticness: getAverage('acousticness'),
//       averageLiveness: getAverage('liveness'),
//       averageSpeechiness: getAverage('speechiness'),
//       averageInstrumentalness: getAverage('instrumentalness'),
//     });
//   } catch (error) {
//     console.error('Soundcharts audio stats error:', error);
//     res.status(500).json({
//       message: 'Nie udało się pobrać audio stats z Soundcharts',
//     });
//   }
// });

export default router;