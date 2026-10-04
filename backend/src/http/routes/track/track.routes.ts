import { Router } from "express";
import { getTrackAudioFeaturesBySpotifyId } from "@integrations/soundcharts/service.js";
import { calculateAudioStats } from "@integrations/reccobeats/reccobeats.stats.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import {
  MAX_TRACKS_LIMIT,
  parseTrackIds,
} from "@integrations/spotify/spotify.validators.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import type { RequestHandler } from "express";
import type { ReccoBeatsTrackAudioFeaturesResult } from "@integrations/reccobeats/reccobeats.types.js";

/** Parametry URL endpointu pobierającego cechy pojedynczego utworu. */
type SpotifyTrackRouteParams = {
  /** Identyfikator utworu w katalogu Spotify. */
  spotifyTrackId: string;
};

/** Zależności zewnętrzne wymagane przez router danych utworów. */
type TrackRouterDependencies = {
  /** Operacje zbiorczego pobierania cech audio z ReccoBeats. */
  reccoBeatsService: {
    getManyTrackAudioFeaturesBySpotifyIds: (
      spotifyIds: string[]
    ) => Promise<ReccoBeatsTrackAudioFeaturesResult[]>;
  };

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
  reccoBeatsService,
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

    const results =
      await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(trackIds);

    res.json({ audio_features: results });
  });

  /**
   * Oblicza zbiorcze statystyki na podstawie cech uzyskanych z ReccoBeats.
   * Utwory, dla których integracja zwróciła błąd, nie wpływają na obliczenia.
   */
  router.post("/audio-stats", authorize, async (req, res) => {
    const trackIds = parseTrackIds(req.body, { maxLimit: MAX_TRACKS_LIMIT });

    const results =
      await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(trackIds);

    const stats = calculateAudioStats(results);

    const totalStats = {
      ...stats,
      totalTracksCount: trackIds.length,
      foundTracksCount: stats.trackCount,
    };

    res.json(totalStats);
  });

  return router;
}

/** Router utworów skonfigurowany z produkcyjnymi zależnościami aplikacji. */
const trackRouter = createTrackRouter({
  reccoBeatsService,
  getSoundchartsAudioFeatures: getTrackAudioFeaturesBySpotifyId,
  authorize: ensureSpotifyAccessToken,
});

export { createTrackRouter };
export default trackRouter;
