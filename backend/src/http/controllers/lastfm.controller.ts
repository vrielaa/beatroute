import { lastfmArtistService } from "@integrations/lastfm/artist/service.js";
import { getLastfmUserInfo } from "@integrations/lastfm/lastfm.service.js";
import { lastfmTrackService } from "@integrations/lastfm/track/service.js";
import {
  parseArtistNames,
  parseTrackInfoQuery,
} from "@integrations/lastfm/lastfm.validators.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import {
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "@integrations/spotify/spotify.mapper.js";
import { createGetSpotifyTrackLastfmInfo } from "@application/music-profile/get-spotify-track-lastfm-info.js";
import { HttpError } from "@http/errors/http-error.js";
import type { Request, Response } from "express";

type SpotifyTrackRouteParams = {
  spotifyTrackId: string;
};

const defaultGetSpotifyTrackLastfmInfo = createGetSpotifyTrackLastfmInfo({
  spotifyTracks: {
    async getTrack(spotifyTrackId, accessToken) {
      const spotifyTrack = await defaultSpotifyGateway.getSpotifyTrackById(
        spotifyTrackId,
        accessToken
      );

      return {
        track: mapSpotifyTrackResponse(spotifyTrack),
        metadataIdentifier: mapSpotifyTrackForLastfm(spotifyTrack),
      };
    },
  },
  trackMetadata: lastfmTrackService,
});

type LastfmControllerDependencies = {
  getUserInfo: typeof getLastfmUserInfo;
  getTrackInfo: typeof lastfmTrackService.getTrackInfo;
  getGenreDistribution: typeof lastfmArtistService.getArtistGenreDistribution;
  getSpotifyTrackInfo: typeof defaultGetSpotifyTrackLastfmInfo;
};

/** Tworzy handlery HTTP Last.fm z jawnymi zależnościami aplikacyjnymi. */
function createLastfmController({
  getUserInfo,
  getTrackInfo,
  getGenreDistribution,
  getSpotifyTrackInfo,
}: LastfmControllerDependencies) {
  async function getLastfmMe(req: Request, res: Response) {
    const lastfmSession = req.session.lastfm;

    if (!lastfmSession) {
      throw new HttpError(
        401,
        "LASTFM_AUTH_REQUIRED",
        "Konto Last.fm nie jest połączone"
      );
    }

    const user = await getUserInfo(lastfmSession.username);

    res.json(user);
  }

  async function getLastfmTrackInfo(req: Request, res: Response) {
    const query = parseTrackInfoQuery(req.query);
    const trackInfo = await getTrackInfo(query);

    res.json(trackInfo);
  }

  async function getArtistGenreDistribution(req: Request, res: Response) {
    const artists = parseArtistNames(req.body);
    const distribution = await getGenreDistribution(artists);

    res.json(distribution);
  }

  async function getSpotifyTrackLastfmInfo(
    req: Request<SpotifyTrackRouteParams>,
    res: Response
  ) {
    const accessToken = req.session.spotify?.accessToken;

    if (!accessToken) {
      throw new HttpError(
        401,
        "SPOTIFY_AUTH_REQUIRED",
        "Użytkownik nie jest zalogowany do Spotify"
      );
    }

    const result = await getSpotifyTrackInfo({
      spotifyTrackId: req.params.spotifyTrackId,
      accessToken,
    });

    res.json(result);
  }

  return {
    getLastfmMe,
    getLastfmTrackInfo,
    getArtistGenreDistribution,
    getSpotifyTrackLastfmInfo,
  };
}

const lastfmController = createLastfmController({
  getUserInfo: getLastfmUserInfo,
  getTrackInfo: lastfmTrackService.getTrackInfo,
  getGenreDistribution: lastfmArtistService.getArtistGenreDistribution,
  getSpotifyTrackInfo: defaultGetSpotifyTrackLastfmInfo,
});

const {
  getLastfmMe,
  getLastfmTrackInfo,
  getArtistGenreDistribution,
  getSpotifyTrackLastfmInfo,
} = lastfmController;

export {
  createLastfmController,
  getLastfmMe,
  getLastfmTrackInfo,
  getArtistGenreDistribution,
  getSpotifyTrackLastfmInfo,
};
export type { LastfmControllerDependencies };
