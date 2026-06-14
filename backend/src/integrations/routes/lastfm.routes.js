import { Router } from "express";
import ensureLastfmSession from "../lastfm/middleware/ensureLastfmSession.js";
import {
  getLastfmArtistGenreDistribution,
  getLastfmTrackInfo,
  getLastfmUserInfo,
  scrobbleTrack,
  updateNowPlaying,
} from "../lastfm/lastfm.service.js";
import { LastfmApiError } from "../lastfm/lastfm.client.js";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  getSpotifyTrackById,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
  SpotifyApiError,
} from "../spotify/spotify.service.js";

const router = Router();

function parseArtistNames(body = {}) {
  if (!Array.isArray(body.artists) || body.artists.length === 0) {
    throw new TypeError("Pole artists musi być niepustą tablicą nazw artystów");
  }

  if (body.artists.length > 40) {
    throw new TypeError(
      "Jednocześnie można analizować maksymalnie 40 artystów"
    );
  }

  const artists = body.artists.map((artist) =>
    typeof artist === "string" ? artist.trim() : ""
  );

  if (artists.some((artist) => !artist)) {
    throw new TypeError("Każdy element artists musi być niepustym tekstem");
  }

  return artists;
}

function parseTrackInfoQuery(query = {}) {
  const mbid = typeof query.mbid === "string" ? query.mbid.trim() : "";

  if (mbid) {
    return { mbid };
  }

  const artist = typeof query.artist === "string" ? query.artist.trim() : "";
  const track = typeof query.track === "string" ? query.track.trim() : "";

  if (!artist || !track) {
    throw new TypeError("Podaj mbid albo oba parametry: artist i track");
  }

  return { artist, track };
}

function parseScrobbleOptions(body = {}) {
  if (!Number.isInteger(body.timestamp) || body.timestamp <= 0) {
    throw new TypeError(
      "Pole timestamp z czasem rozpoczęcia utworu jest wymagane"
    );
  }

  const options = { timestamp: body.timestamp };

  if (body.chosenByUser !== undefined) {
    if (typeof body.chosenByUser !== "boolean") {
      throw new TypeError("Pole chosenByUser musi być wartością boolean");
    }

    options.chosenByUser = body.chosenByUser;
  }

  return options;
}

function parseTrackData(body = {}, { isScrobble = false } = {}) {
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";
  const track = typeof body.track === "string" ? body.track.trim() : "";

  if (!artist || !track) {
    throw new TypeError("Pola artist i track są wymagane");
  }

  const trackData = { artist, track };
  const optionalStringFields = ["album", "albumArtist", "mbid"];

  for (const field of optionalStringFields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string") {
        throw new TypeError(`Pole ${field} musi być tekstem`);
      }

      const value = body[field].trim();

      if (value) {
        trackData[field] = value;
      }
    }
  }

  for (const field of ["duration", "trackNumber"]) {
    if (body[field] !== undefined) {
      if (!Number.isInteger(body[field]) || body[field] <= 0) {
        throw new TypeError(`Pole ${field} musi być dodatnią liczbą całkowitą`);
      }

      trackData[field] = body[field];
    }
  }

  if (isScrobble) {
    Object.assign(trackData, parseScrobbleOptions(body));
  }

  return trackData;
}

function sendLastfmError(res, error, message) {
  if (error instanceof TypeError) {
    return res.status(400).json({ message: error.message });
  }

  const status =
    error instanceof LastfmApiError && error.code === 9 ? 401 : 502;

  return res.status(status).json({
    message,
    lastfmError: error instanceof Error ? error.message : String(error),
    lastfmCode: error instanceof LastfmApiError ? error.code : null,
  });
}

function sendSpotifyOrLastfmError(res, error, message) {
  if (error instanceof SpotifyApiError) {
    return res.status(error.status).json({
      message: error.message,
      spotifyError: error.data,
    });
  }

  return sendLastfmError(res, error, message);
}

router.get("/me", ensureLastfmSession, async (req, res) => {
  try {
    const user = await getLastfmUserInfo(req.session.lastfm.username);

    res.json(user);
  } catch (error) {
    console.error("Last.fm user info error:", error);
    res.status(502).json({
      message: "Nie udało się pobrać profilu Last.fm",
    });
  }
});

router.get("/track-info", async (req, res) => {
  try {
    const query = parseTrackInfoQuery(req.query);
    const trackInfo = await getLastfmTrackInfo(query);

    res.json(trackInfo);
  } catch (error) {
    console.error("Last.fm track info error:", error);
    sendLastfmError(
      res,
      error,
      "Nie udało się pobrać informacji o utworze z Last.fm"
    );
  }
});

router.post("/artist-genres", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const artists = parseArtistNames(req.body);
    const distribution = await getLastfmArtistGenreDistribution(artists);

    res.json(distribution);
  } catch (error) {
    console.error("Last.fm artist genres error:", error);
    sendLastfmError(
      res,
      error,
      "Nie udało się pobrać gatunków artystów z Last.fm"
    );
  }
});

router.get(
  "/spotify-tracks/:spotifyTrackId",
  ensureSpotifyAccessToken,
  async (req, res) => {
    try {
      const spotifyTrack = await getSpotifyTrackById(
        req.params.spotifyTrackId,
        req.session.spotify.accessToken
      );
      const lastfmTrackData = mapSpotifyTrackForLastfm(spotifyTrack);
      const lastfmTrackInfo = await getLastfmTrackInfo(lastfmTrackData);

      res.json({
        spotify: mapSpotifyTrackResponse(spotifyTrack),
        lastfm: lastfmTrackInfo,
      });
    } catch (error) {
      console.error("Spotify to Last.fm track info error:", error);
      sendSpotifyOrLastfmError(
        res,
        error,
        "Nie udało się pobrać informacji o utworze"
      );
    }
  }
);

router.post(
  "/spotify-tracks/:spotifyTrackId/now-playing",
  ensureSpotifyAccessToken,
  ensureLastfmSession,
  async (req, res) => {
    try {
      const spotifyTrack = await getSpotifyTrackById(
        req.params.spotifyTrackId,
        req.session.spotify.accessToken
      );
      const lastfmTrackData = mapSpotifyTrackForLastfm(spotifyTrack);
      const result = await updateNowPlaying(
        lastfmTrackData,
        req.session.lastfm.sessionKey
      );

      res.json({
        spotify: mapSpotifyTrackResponse(spotifyTrack),
        nowPlaying: result.nowplaying,
      });
    } catch (error) {
      console.error("Spotify track now playing error:", error);
      sendSpotifyOrLastfmError(
        res,
        error,
        "Nie udało się ustawić aktualnie odtwarzanego utworu"
      );
    }
  }
);

router.post(
  "/spotify-tracks/:spotifyTrackId/scrobble",
  ensureSpotifyAccessToken,
  ensureLastfmSession,
  async (req, res) => {
    try {
      const scrobbleOptions = parseScrobbleOptions(req.body);
      const spotifyTrack = await getSpotifyTrackById(
        req.params.spotifyTrackId,
        req.session.spotify.accessToken
      );
      const lastfmTrackData = {
        ...mapSpotifyTrackForLastfm(spotifyTrack),
        ...scrobbleOptions,
      };
      const result = await scrobbleTrack(
        lastfmTrackData,
        req.session.lastfm.sessionKey
      );

      res.json({
        spotify: mapSpotifyTrackResponse(spotifyTrack),
        scrobbles: result.scrobbles,
      });
    } catch (error) {
      console.error("Spotify track scrobble error:", error);
      sendSpotifyOrLastfmError(
        res,
        error,
        "Nie udało się wysłać scrobble do Last.fm"
      );
    }
  }
);

router.post("/now-playing", ensureLastfmSession, async (req, res) => {
  try {
    const trackData = parseTrackData(req.body);
    const result = await updateNowPlaying(
      trackData,
      req.session.lastfm.sessionKey
    );

    res.json(result);
  } catch (error) {
    console.error("Last.fm now playing error:", error);
    sendLastfmError(
      res,
      error,
      "Nie udało się ustawić aktualnie odtwarzanego utworu"
    );
  }
});

router.post("/scrobble", ensureLastfmSession, async (req, res) => {
  try {
    const trackData = parseTrackData(req.body, { isScrobble: true });
    const result = await scrobbleTrack(
      trackData,
      req.session.lastfm.sessionKey
    );

    res.json(result);
  } catch (error) {
    console.error("Last.fm scrobble error:", error);
    sendLastfmError(res, error, "Nie udało się wysłać scrobble do Last.fm");
  }
});

export default router;
