import { Router } from "express";
import {
  createMusicMapService,
  type MusicMapService,
} from "@application/music-map/build-music-map.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { parseMusicMapQuery } from "./validators.js";
import type { RequestHandler } from "express";

/** Zależności routera udostępniającego mapę muzyczną użytkownika. */
type MusicMapRouterDependencies = {
  /** Serwis pobierający dane i wykonujący analizę mapy muzycznej. */
  musicMapService: Pick<MusicMapService, "buildMusicMap">;
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

  /** Buduje mapę muzyczną dla danych wybranych parametrami query. */
  router.get("/playground", authorize, async (req, res) => {
    const selection = parseMusicMapQuery(req.query);
    const musicMap = await musicMapService.buildMusicMap({
      accessToken: req.session.spotify!.accessToken,
      ...selection,
    });

    res.json(musicMap);
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
