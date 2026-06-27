import { getLastfmArtistGenreDistribution } from "./lastfm.artist.service.js";
import { getLastfmUserInfo } from "./lastfm.service.js";
import { getLastfmTrackInfo as fetchLastfmTrackInfo } from "./lastfm.track.service.js";
import {
  parseArtistNames,
  parseTrackInfoQuery,
} from "./lastfm.validators.js";
import {
  mapLastfmError,
  mapSpotifyOrLastfmError,
} from "./api-error.mapper.js";
import {
  getSpotifyTrackById,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "../spotify/spotify.service.js";

function sendMappedError(res, mappedError) {
  return res.status(mappedError.status).json(mappedError.body);
}

export async function getLastfmMe(req, res) {
  try {
    const user = await getLastfmUserInfo(req.session.lastfm.username);

    res.json(user);
  } catch (error) {
    console.error("Last.fm user info error:", error);
    sendMappedError(
      res,
      mapLastfmError(error, "Nie udało się pobrać profilu Last.fm")
    );
  }
}

export async function getLastfmTrackInfo(req, res) {
  try {
    const query = parseTrackInfoQuery(req.query);
    const trackInfo = await fetchLastfmTrackInfo(query);

    res.json(trackInfo);
  } catch (error) {
    console.error("Last.fm track info error:", error);
    sendMappedError(
      res,
      mapLastfmError(
        error,
        "Nie udało się pobrać informacji o utworze z Last.fm"
      )
    );
  }
}

export async function getArtistGenreDistribution(req, res) {
  try {
    const artists = parseArtistNames(req.body);
    const distribution = await getLastfmArtistGenreDistribution(artists);

    res.json(distribution);
  } catch (error) {
    console.error("Last.fm artist genres error:", error);
    sendMappedError(
      res,
      mapLastfmError(
        error,
        "Nie udało się pobrać gatunków artystów z Last.fm"
      )
    );
  }
}

export async function getSpotifyTrackLastfmInfo(req, res) {
  try {
    const spotifyTrack = await getSpotifyTrackById(
      req.params.spotifyTrackId,
      req.session.spotify.accessToken
    );
    const lastfmTrackData = mapSpotifyTrackForLastfm(spotifyTrack);
    const lastfmTrackInfo = await fetchLastfmTrackInfo(lastfmTrackData);

    res.json({
      spotify: mapSpotifyTrackResponse(spotifyTrack),
      lastfm: lastfmTrackInfo,
    });
  } catch (error) {
    console.error("Spotify to Last.fm track info error:", error);
    sendMappedError(
      res,
      mapSpotifyOrLastfmError(
        error,
        "Nie udało się pobrać informacji o utworze"
      )
    );
  }
}
