import { Router } from "express";
import { getTrackAudioFeaturesBySpotifyId } from "@integrations/soundcharts/service.js";
import { trackAnalysisService } from "./composition.js";
import {
  MAX_TRACKS_LIMIT,
  parseTrackIds,
} from "@integrations/spotify/spotify.validators.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import type { RequestHandler } from "express";
import type { TrackAnalysisService } from "@application/tracks/track-analysis.service.js";

/** Parametry URL endpointu pobierającego cechy pojedynczego utworu. */
type SpotifyTrackRouteParams = {
  /** Identyfikator utworu w katalogu Spotify. */
  spotifyTrackId: string;
};

/** Zależności zewnętrzne wymagane przez router danych utworów. */
type TrackRouterDependencies = {
  /** Przypadki użycia pobierania i analizowania cech audio. */
  trackAnalysisService: TrackAnalysisService;

  /** Pobiera z Soundcharts cechy audio pojedynczego utworu Spotify. */
  getSoundchartsAudioFeatures(spotifyTrackId: string): Promise<unknown>;

  /** Middleware dopuszczający wyłącznie żądania z aktywną sesją Spotify. */
  authorize: RequestHandler;
};

/**
 * Tworzy router pobierający cechy audio utworów i obliczający ich statystyki.
 * Przyjęcie integracji i middleware jako zależności pozwala zastąpić je atrapami
 * podczas testowania warstwy HTTP.
 *
 * @param dependencies - Serwis ReccoBeats, operacja Soundcharts i autoryzacja.
 * @returns Router Express obsługujący endpointy danych utworów.
 */
function createTrackRouter({
  trackAnalysisService,
  getSoundchartsAudioFeatures,
  authorize,
}: TrackRouterDependencies) {
  const router = Router();

  /** Pobiera z Soundcharts cechy audio pojedynczego utworu Spotify. */
  router.get<SpotifyTrackRouteParams>(
    "/:spotifyTrackId/audio-features",
    authorize,
    async (req, res) => {
      const data = await getSoundchartsAudioFeatures(req.params.spotifyTrackId);

      res.json(data);
    }
  );

  /**
   * Pobiera z ReccoBeats cechy audio dla maksymalnie 40 utworów Spotify.
   * Odpowiedź zachowuje osobny wynik albo opis błędu dla każdego identyfikatora.
   */
  router.post("/audio-features", authorize, async (req, res) => {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const results = await trackAnalysisService.getAudioFeatures(trackIds);

    res.json({ audio_features: results });
  });

  /**
   * Oblicza zbiorcze statystyki na podstawie cech uzyskanych z ReccoBeats.
   * Utwory, dla których integracja zwróciła błąd, nie wpływają na obliczenia.
   */
  router.post("/audio-stats", authorize, async (req, res) => {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const stats = await trackAnalysisService.getAudioStats(trackIds);

    res.json(stats);
  });

  router.post("/analysis", authorize, async (req, res) => {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const { stats, audioFeatures } =
      await trackAnalysisService.getTracksAnalysis(trackIds);

    res.json({ stats, audioFeatures });
  });

  return router;
}

/** Router utworów skonfigurowany z produkcyjnymi zależnościami aplikacji. */
const trackRouter = createTrackRouter({
  trackAnalysisService: trackAnalysisService,
  getSoundchartsAudioFeatures: getTrackAudioFeaturesBySpotifyId,
  authorize: ensureSpotifyAccessToken,
});

export { createTrackRouter };
export default trackRouter;
