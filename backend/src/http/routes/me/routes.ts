import { Router } from "express";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import {
  MAX_ARTISTS_LIMIT,
  parseSpotifyTopItemsQuery,
  parseSpotifyTopTracksQuery,
} from "@integrations/spotify/spotify.validators.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import { createTopTracksService } from "@application/tracks/top-tracks.service.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { parseTopTracksBatchQuery } from "./top-tracks.validator.js";
import type { TopTracksBatchReader } from "@application/tracks/top-tracks.types.js";
import type { RequestHandler } from "express";
import type { SpotifyGateway } from "@integrations/spotify/spotify.types.js";

/** Operacje Spotify potrzebne trasom danych bieżącego użytkownika. */
type SpotifyMeGateway = Pick<
  SpotifyGateway,
  | "getCurrentUserProfile"
  | "getCurrentUserTopTracks"
  | "getCurrentUserTopArtists"
>;

/** Zależności routera udostępniającego dane bieżącego użytkownika Spotify. */
type SpotifyMeRouterDependencies = {
  topTracksService: TopTracksBatchReader;
  /** Middleware dopuszczający wyłącznie żądania z aktywną sesją Spotify. */
  authorize: RequestHandler;
  /** Operacje pobierające profil oraz najczęściej słuchane zasoby. */
  spotifyGateway: SpotifyMeGateway;
};

/**
 * Tworzy router profilu i najczęściej słuchanych zasobów użytkownika Spotify.
 *
 * Trasy wymagają aktywnej sesji Spotify. Parametry list top są walidowane przed
 * przekazaniem ich do gatewaya. Top utwory obsługują offset domyślnie równy 0;
 * pojedyncze żądanie nie dobiera kolejnych utworów ani nie pobiera cech audio.
 *
 * @param dependencies - Gateway Spotify i middleware autoryzacji.
 * @returns Router obsługujący profil, top utwory i top artystów.
 */
function createMeRouter({
  topTracksService,
  spotifyGateway,
  authorize,
}: SpotifyMeRouterDependencies): Router {
  const router = Router();

  /** Przygotowuje jedną partię, bez ukrytego dobierania kolejnych stron. */
  router.get("/top-tracks/dataset", authorize, async (req, res) => {
    const selection = parseTopTracksBatchQuery(req.query);
    res.json(
      await topTracksService.getTopTracksBatch(
        req.session.spotify!.accessToken,
        selection
      )
    );
  });

  router.get("/top-tracks", authorize, async (req, res) => {
    const selection = parseSpotifyTopTracksQuery(req.query);

    const data = await spotifyGateway.getCurrentUserTopTracks(
      req.session.spotify!.accessToken,
      selection
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
  topTracksService: createTopTracksService({
    spotifyGateway: defaultSpotifyGateway,
    audioFeaturesReader: reccoBeatsService,
  }),
  spotifyGateway: defaultSpotifyGateway,
  authorize: ensureSpotifyAccessToken,
});

export { createMeRouter };
export default meRouter;
