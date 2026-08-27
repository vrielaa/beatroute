import { getLastfmArtistGenreDistribution } from "./artist/service.js";
import { getLastfmUserInfo } from "./lastfm.service.js";
import { getLastfmTrackInfo as fetchLastfmTrackInfo } from "./track/service.js";
import { parseArtistNames, parseTrackInfoQuery } from "./lastfm.validators.js";
import {
  getSpotifyTrackById,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "../spotify/spotify.service.js";
import { createGetSpotifyTrackLastfmInfo } from "../../application/music-profile/get-spotify-track-lastfm-info.js";

const getSpotifyTrackLastfmInfoUseCase = createGetSpotifyTrackLastfmInfo({
  getSpotifyTrackById,
  getLastfmTrackInfo: fetchLastfmTrackInfo,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
});

export async function getLastfmMe(req, res) {
  const user = await getLastfmUserInfo(req.session.lastfm.username);

  res.json(user);
}

export async function getLastfmTrackInfo(req, res) {
  const query = parseTrackInfoQuery(req.query);
  const trackInfo = await fetchLastfmTrackInfo(query);

  res.json(trackInfo);
}

export async function getArtistGenreDistribution(req, res) {
  const artists = parseArtistNames(req.body);
  const distribution = await getLastfmArtistGenreDistribution(artists);

  res.json(distribution);
}

export async function getSpotifyTrackLastfmInfo(req, res) {
  const result = await getSpotifyTrackLastfmInfoUseCase({
    spotifyTrackId: req.params.spotifyTrackId,
    accessToken: req.session.spotify.accessToken,
  });

  res.json(result);
}
