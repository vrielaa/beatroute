import { createArtistGenreDistribution } from "@application/lastfm/artist-genre-distribution.js";
import { createLastfmTrackInfo } from "@application/lastfm/track-info.js";
import { lastfmArtistReader } from "@integrations/lastfm/artist/reader.js";
import { getLastfmUserInfo } from "@integrations/lastfm/lastfm.user.js";
import { isLikelyGenreTag } from "@integrations/lastfm/genre-classifier.js";
import { lastfmTrackReader } from "@integrations/lastfm/track/reader.js";
import {
  parseArtistNames,
  parseTrackInfoQuery,
} from "@http/routes/lastfm/validators.js";
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

const lastfmTrackInfoService = createLastfmTrackInfo({
  trackReader: lastfmTrackReader,
  getArtistTags: lastfmArtistReader.getArtistTags,
  isGenreTag: isLikelyGenreTag,
});

const defaultGetArtistGenreDistribution = createArtistGenreDistribution({
  artistReader: lastfmArtistReader,
});

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
  trackMetadata: lastfmTrackInfoService,
});

type LastfmControllerDependencies = {
  getUserInfo: typeof getLastfmUserInfo;
  getTrackInfo: typeof lastfmTrackInfoService.getTrackInfo;
  getGenreDistribution: typeof defaultGetArtistGenreDistribution;
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
  getTrackInfo: lastfmTrackInfoService.getTrackInfo,
  getGenreDistribution: defaultGetArtistGenreDistribution,
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
