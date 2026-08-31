import { lastfmArtistService } from "./artist/service.js";
import { getLastfmUserInfo } from "./lastfm.service.js";
import { lastfmTrackService } from "./track/service.js";
import { parseArtistNames, parseTrackInfoQuery } from "./lastfm.validators.js";
import { defaultSpotifyGateway } from "../spotify/spotify.gateway.js";
import {
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "../spotify/spotify.mapper.js";
import { createGetSpotifyTrackLastfmInfo } from "../../application/music-profile/get-spotify-track-lastfm-info.js";
import type { Request, Response } from "express";

type SpotifyTrackRouteParams = {
  spotifyTrackId: string;
};

const getSpotifyTrackLastfmInfoUseCase = createGetSpotifyTrackLastfmInfo({
  getSpotifyTrackById: defaultSpotifyGateway.getSpotifyTrackById,
  getLastfmTrackInfo: lastfmTrackService.getTrackInfo,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
});

async function getLastfmMe(req: Request, res: Response) {
  const lastfmSession = req.session.lastfm;

  if (!lastfmSession) {
    return res.status(401).json({ error: "Nieautoryzowany dostęp" });
  }

  const user = await getLastfmUserInfo(lastfmSession.username);

  res.json(user);
}

async function getLastfmTrackInfo(req: Request, res: Response) {
  const query = parseTrackInfoQuery(req.query);
  const trackInfo = await lastfmTrackService.getTrackInfo(query);

  res.json(trackInfo);
}

async function getArtistGenreDistribution(req: Request, res: Response) {
  const artists = parseArtistNames(req.body);
  const distribution =
    await lastfmArtistService.getArtistGenreDistribution(artists);

  res.json(distribution);
}

async function getSpotifyTrackLastfmInfo(
  req: Request<SpotifyTrackRouteParams>,
  res: Response
) {
  const accessToken = req.session.spotify?.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: "Nieautoryzowany dostęp" });
  }

  const result = await getSpotifyTrackLastfmInfoUseCase({
    spotifyTrackId: req.params.spotifyTrackId,
    accessToken,
  });

  res.json(result);
}

export {
  getLastfmMe,
  getLastfmTrackInfo,
  getArtistGenreDistribution,
  getSpotifyTrackLastfmInfo,
};
