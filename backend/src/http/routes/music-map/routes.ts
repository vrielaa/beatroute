import { Router } from "express";
import {
  createMusicMapService,
  type MusicMapService,
} from "@application/music-map/build-music-map.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import {
  parseMusicMapAnalysisBody,
  parseMusicMapDatasetQuery,
} from "./validators.js";
import type { RequestHandler } from "express";

/** Zależności routera udostępniającego mapę muzyczną użytkownika. */
type MusicMapRouterDependencies = {
  /** Serwis pobierający dane i wykonujący analizę mapy muzycznej. */
  musicMapService: Pick<
    MusicMapService,
    "analyzeMusicMap" | "getMusicMapDataset"
  >;
  /** Middleware dopuszczający wyłącznie żądania z aktywną sesją Spotify. */
  authorize: RequestHandler;
};

/**
 * Tworzy router generujący mapę najczęściej słuchanych utworów użytkownika.
 * Parametry query są walidowane przed przekazaniem ich do przypadku użycia.
 *
 * @param dependencies - Serwis mapy muzycznej i middleware autoryzacji.
 * @returns Router Express obsługujący endpoint mapy muzycznej.
 */
function createMusicMapRouter({
  musicMapService,
  authorize,
}: MusicMapRouterDependencies): Router {
  const router = Router();

  /** Pobiera utwory i cechy audio, które frontend zachowuje do kolejnych analiz. */
  router.get("/dataset", authorize, async (req, res) => {
    const selection = parseMusicMapDatasetQuery(req.query);
    const dataset = await musicMapService.getMusicMapDataset({
      accessToken: req.session.spotify!.accessToken,
      ...selection,
    });

    res.json(dataset);
  });

  /** Ponownie analizuje przesłany zbiór bez wywoływania Spotify ani ReccoBeats. */
  router.post("/analysis", authorize, (req, res) => {
    const { dataset, clusterCount } = parseMusicMapAnalysisBody(req.body);
    const result = musicMapService.analyzeMusicMap(dataset, clusterCount);

    res.json(result);
  });

  return router;
}

/** Router mapy muzycznej skonfigurowany z produkcyjnymi zależnościami. */
const defaultMusicMapService = createMusicMapService({
  spotifyGateway: defaultSpotifyGateway,
  reccoBeatsService,
});

const musicMapRouter = createMusicMapRouter({
  musicMapService: defaultMusicMapService,
  authorize: ensureSpotifyAccessToken,
});

export { createMusicMapRouter };
export default musicMapRouter;
