import { Router } from "express";
import ensureSpotifyAccessToken from "../../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  MAX_ARTISTS_LIMIT,
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../../spotify/spotify.validators.js";
import { defaultSpotifyGateway } from "../../spotify/spotify.gateway.js";
import type { RequestHandler } from "express";
import type { SpotifyGateway } from "../../spotify/spotify.types.js";

/** Operacje Spotify potrzebne trasom danych bieżącego użytkownika. */
type SpotifyMeGateway = Pick<
  SpotifyGateway,
  | "getCurrentUserProfile"
  | "getCurrentUserTopTracks"
  | "getCurrentUserTopArtists"
>;

/** Zależności routera udostępniającego dane bieżącego użytkownika Spotify. */
type SpotifyMeRouterDependencies = {
  /** Middleware dopuszczający wyłącznie żądania z aktywną sesją Spotify. */
  authorize: RequestHandler;
  /** Operacje pobierające profil oraz najczęściej słuchane zasoby. */
  spotifyGateway: SpotifyMeGateway;
};

/**
 * Tworzy router profilu i najczęściej słuchanych zasobów użytkownika Spotify.
 *
 * Trasy wymagają aktywnej sesji Spotify. Parametry list top są walidowane przed
 * przekazaniem ich do gatewaya.
 *
 * @param dependencies - Gateway Spotify i middleware autoryzacji.
 * @returns Router obsługujący profil, top utwory i top artystów.
 */
function createMeRouter({
  spotifyGateway,
  authorize,
}: SpotifyMeRouterDependencies): Router {
  const router = Router();

  router.get("/top-tracks", authorize, async (req, res) => {
    const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
      maxLimit: MAX_TRACKS_LIMIT,
    });

    const data = await spotifyGateway.getCurrentUserTopTracks(
      req.session.spotify!.accessToken,
      {
        limit,
        timeRange,
      }
    );

    res.json(data);
  });

  router.get("/top-artists", authorize, async (req, res) => {
    const { limit, timeRange } = parseSpotifyTopItemsQuery(req.query, {
      maxLimit: MAX_ARTISTS_LIMIT,
    });

    const data = await spotifyGateway.getCurrentUserTopArtists(
      req.session.spotify!.accessToken,
      {
        limit,
        timeRange,
      }
    );

    res.json(data);
  });

  router.get("/profile", authorize, async (req, res) => {
    const data = await spotifyGateway.getCurrentUserProfile(
      req.session.spotify!.accessToken
    );

    res.json(data);
  });

  return router;
}

/** Router skonfigurowany z produkcyjnymi zależnościami Spotify. */
const meRouter = createMeRouter({
  spotifyGateway: defaultSpotifyGateway,
  authorize: ensureSpotifyAccessToken,
});

export { createMeRouter };
export default meRouter;
