import { Router } from "express";
import ensureLastfmSession from "@integrations/lastfm/middleware/ensureLastfmSession.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { lastfmOperations } from "./composition.js";
import { parseArtistNames, parseTrackInfoQuery } from "./validators.js";
import { HttpError } from "@http/errors/http-error.js";
import type { RequestHandler } from "express";

/**
 * Zależności endpointów Last.fm.
 *
 * @property authorizeLastfm - Sprawdza połączenie konta Last.fm.
 * @property authorizeSpotify - Sprawdza i odnawia sesję Spotify.
 * @property getUserInfo - Pobiera profil użytkownika Last.fm.
 * @property getTrackInfo - Pobiera metadane i gatunki utworu.
 * @property getGenreDistribution - Buduje rozkład gatunków artystów.
 * @property getSpotifyTrackInfo - Łączy dane utworu Spotify z metadanymi Last.fm.
 */
type LastfmRouterDependencies = typeof lastfmOperations & {
  authorizeLastfm: RequestHandler;
  authorizeSpotify: RequestHandler;
};

/**
 * Parametry ścieżki profilu utworu Spotify i Last.fm.
 *
 * @property spotifyTrackId - Identyfikator utworu przekazany w adresie endpointu.
 */
type SpotifyTrackRouteParams = {
  spotifyTrackId: string;
};

/**
 * Tworzy router Last.fm z jawnymi operacjami i middleware autoryzacji.
 * Handlery odczytują sesję, walidują wejście i zwracają wynik operacji jako JSON.
 */
function createLastfmRouter({
  authorizeLastfm,
  authorizeSpotify,
  getUserInfo,
  getTrackInfo,
  getGenreDistribution,
  getSpotifyTrackInfo,
}: LastfmRouterDependencies) {
  const lastfmRouter = Router();

  lastfmRouter.get("/me", authorizeLastfm, async (req, res) => {
    const lastfmSession = req.session.lastfm;

    if (!lastfmSession) {
      throw new HttpError(
        401,
        "LASTFM_AUTH_REQUIRED",
        "Konto Last.fm nie jest połączone"
      );
    }

    res.json(await getUserInfo(lastfmSession.username));
  });

  lastfmRouter.get("/track-info", async (req, res) => {
    const identifier = parseTrackInfoQuery(req.query);
    res.json(await getTrackInfo(identifier));
  });
  lastfmRouter.post("/artist-genres", authorizeSpotify, async (req, res) => {
    const artists = parseArtistNames(req.body);
    res.json(await getGenreDistribution(artists));
  });
  lastfmRouter.get<SpotifyTrackRouteParams>(
    "/spotify-tracks/:spotifyTrackId",
    authorizeSpotify,
    async (req, res) => {
      const accessToken = req.session.spotify?.accessToken;

      if (!accessToken) {
        throw new HttpError(
          401,
          "SPOTIFY_AUTH_REQUIRED",
          "Użytkownik nie jest zalogowany do Spotify"
        );
      }

      res.json(
        await getSpotifyTrackInfo({
          spotifyTrackId: req.params.spotifyTrackId,
          accessToken,
        })
      );
    }
  );

  return lastfmRouter;
}

const lastfmRouter = createLastfmRouter({
  authorizeLastfm: ensureLastfmSession,
  authorizeSpotify: ensureSpotifyAccessToken,
  ...lastfmOperations,
});

export { createLastfmRouter };
export type { LastfmRouterDependencies };
export default lastfmRouter;
