import { Router } from "express";

import { buildMusicMap } from "../../domain/music-map/music-map.service.js";
import { RequestValidationError } from "../../http/request-validation-error.js";
import ensureSpotifyAccessToken from "../spotify/middleware/ensureSpotifyAccessToken.js";
import {
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../spotify/spotify.validators.js";

const DEFAULT_MUSIC_MAP_LIMIT = 40;
const DEFAULT_MUSIC_MAP_TIME_RANGE = "long_term";
const MIN_MUSIC_MAP_CLUSTER_COUNT = 2;
const MAX_MUSIC_MAP_CLUSTER_COUNT = 8;

const router = Router();

router.get("/playground", ensureSpotifyAccessToken, async (req, res) => {
  const { limit, timeRange } = parseMusicMapTopTracksQuery(req.query);
  const clusterCount = parseClusterCount(req.query.clusters);
  const musicMap = await buildMusicMap({
    accessToken: req.session.spotify.accessToken,
    limit,
    timeRange,
    clusterCount,
  });

  res.json(musicMap);
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

export default router;
