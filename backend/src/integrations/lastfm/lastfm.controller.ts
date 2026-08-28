import { getLastfmArtistGenreDistribution } from "./artist/service.js";
import { getLastfmUserInfo } from "./lastfm.service.js";
import { getLastfmTrackInfo as fetchLastfmTrackInfo } from "./track/service.js";
import { parseArtistNames, parseTrackInfoQuery } from "./lastfm.validators.js";
import { getSpotifyTrackById } from "../spotify/spotify.gateway.js";
import {
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "../spotify/spotify.mapper.js";
import { createGetSpotifyTrackLastfmInfo } from "../../application/music-profile/get-spotify-track-lastfm-info.js";
import { Request, Response } from "express";

const getSpotifyTrackLastfmInfoUseCase = createGetSpotifyTrackLastfmInfo({
  getSpotifyTrackById,
  getLastfmTrackInfo: fetchLastfmTrackInfo,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
});

export async function getLastfmMe(req: Request, res: Response) {
  const lastfmSession = req.session.lastfm;

  if (!lastfmSession) {
    return res.status(401).json({ error: "Nieautoryzowany dostęp" });
  }

  const user = await getLastfmUserInfo(lastfmSession.username);

  res.json(user);
}

export async function getLastfmTrackInfo(req: Request, res: Response) {
  const query = parseTrackInfoQuery(req.query);
  const trackInfo = await fetchLastfmTrackInfo(query);

  res.json(trackInfo);
}

export async function getArtistGenreDistribution(req: Request, res: Response) {
  const artists = parseArtistNames(req.body);
  const distribution = await getLastfmArtistGenreDistribution(artists);

  res.json(distribution);
}

export async function getSpotifyTrackLastfmInfo(req: Request, res: Response) {
  const accessToken = req.session.spotify?.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: "Nieautoryzowany dostęp" });
  }

  const result = await getSpotifyTrackLastfmInfoUseCase({
    spotifyTrackId: req.params.spotifyTrackId,
    accessToken: accessToken,
  });

  res.json(result);
}
