import { Router } from "express";
import ensureLastfmSession from "../lastfm/middleware/ensureLastfmSession.js";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  getArtistGenreDistribution,
  getLastfmMe,
  getLastfmTrackInfo,
  getSpotifyTrackLastfmInfo,
} from "../lastfm/lastfm.controller.js";

type LastfmRouterDependencies = {
  authorizeLastfm: typeof ensureLastfmSession;
  authorizeSpotify: typeof ensureSpotifyAccessToken;
  handlers: {
    getLastfmMe: typeof getLastfmMe;
    getLastfmTrackInfo: typeof getLastfmTrackInfo;
    getArtistGenreDistribution: typeof getArtistGenreDistribution;
    getSpotifyTrackLastfmInfo: typeof getSpotifyTrackLastfmInfo;
  };
};

/** Tworzy router endpointów Last.fm z jawnymi handlerami i autoryzacją. */
function createLastfmRouter({
  authorizeLastfm,
  authorizeSpotify,
  handlers,
}: LastfmRouterDependencies) {
  const lastfmRouter = Router();

  lastfmRouter.get("/me", authorizeLastfm, handlers.getLastfmMe);
  lastfmRouter.get("/track-info", handlers.getLastfmTrackInfo);
  lastfmRouter.post(
    "/artist-genres",
    authorizeSpotify,
    handlers.getArtistGenreDistribution
  );
  lastfmRouter.get(
    "/spotify-tracks/:spotifyTrackId",
    authorizeSpotify,
    handlers.getSpotifyTrackLastfmInfo
  );

  return lastfmRouter;
}

const lastfmRouter = createLastfmRouter({
  authorizeLastfm: ensureLastfmSession,
  authorizeSpotify: ensureSpotifyAccessToken,
  handlers: {
    getLastfmMe,
    getLastfmTrackInfo,
    getArtistGenreDistribution,
    getSpotifyTrackLastfmInfo,
  },
});

export { createLastfmRouter };
export type { LastfmRouterDependencies };
export default lastfmRouter;
