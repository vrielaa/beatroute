import { Router } from "express";

import { exportTopTracksAudioFeaturesCsv } from "../../domain/music-map/music-map-csv-export.service.js";
import { buildMusicMap } from "../../domain/music-map/music-map.service.js";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  isRequestValidationError,
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
  RequestValidationError,
} from "../spotify/spotify.validators.js";
import { SpotifyApiError } from "../spotify/spotify.service.js";

const DEFAULT_MUSIC_MAP_LIMIT = 40;
const DEFAULT_MUSIC_MAP_TIME_RANGE = "long_term";
const MIN_MUSIC_MAP_CLUSTER_COUNT = 2;
const MAX_MUSIC_MAP_CLUSTER_COUNT = 8;

const router = Router();

router.get("/playground", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const { limit, timeRange } = parseMusicMapTopTracksQuery(req.query);
    const clusterCount = parseClusterCount(req.query.clusters);
    const musicMap = await buildMusicMap({
      accessToken: req.session.spotify.accessToken,
      limit,
      timeRange,
      clusterCount,
    });

    res.json(musicMap);
  } catch (error) {
    sendMusicMapError(res, error, {
      logMessage: "Music map playground error:",
      fallbackMessage: "Nie udało się wygenerować mapy muzycznej",
    });
  }
});

router.get("/export-csv", ensureSpotifyAccessToken, async (req, res) => {
  try {
    const { limit, timeRange } = parseMusicMapTopTracksQuery(req.query);
    const exportResult = await exportTopTracksAudioFeaturesCsv({
      accessToken: req.session.spotify.accessToken,
      limit,
      timeRange,
    });

    res.json({
      message: "CSV z danymi utworów został zapisany",
      ...exportResult,
    });
  } catch (error) {
    sendMusicMapError(res, error, {
      logMessage: "Music map CSV export error:",
      fallbackMessage: "Nie udało się zapisać CSV z danymi utworów",
    });
  }
});

function parseMusicMapTopTracksQuery(query) {
  return parseSpotifyTopItemsQuery(
    {
      ...query,
      limit: query.limit ?? String(DEFAULT_MUSIC_MAP_LIMIT),
      time_range: query.time_range ?? DEFAULT_MUSIC_MAP_TIME_RANGE,
    },
    { maxLimit: MAX_TRACKS_LIMIT }
  );
}

function parseClusterCount(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const clusterCount = Number(rawValue);

  if (
    !Number.isInteger(clusterCount) ||
    clusterCount < MIN_MUSIC_MAP_CLUSTER_COUNT ||
    clusterCount > MAX_MUSIC_MAP_CLUSTER_COUNT
  ) {
    throw new RequestValidationError(
      `clusters musi być liczbą całkowitą od ${MIN_MUSIC_MAP_CLUSTER_COUNT} do ${MAX_MUSIC_MAP_CLUSTER_COUNT}`
    );
  }

  return clusterCount;
}

function sendMusicMapError(res, error, { logMessage, fallbackMessage }) {
  if (isRequestValidationError(error)) {
    return res.status(400).json({ message: error.message });
  }

  if (error instanceof SpotifyApiError) {
    return res.status(error.status).json(error.data);
  }

  console.error(logMessage, error);

  return res.status(500).json({ message: fallbackMessage });
}

export default router;
