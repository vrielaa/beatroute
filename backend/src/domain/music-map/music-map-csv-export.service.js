import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MUSIC_MAP_FEATURE_KEYS,
  getTopTracksWithAudioFeatures,
} from "./music-map.service.js";

const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIRECTORY = path.dirname(CURRENT_FILE_PATH);
const DEFAULT_EXPORT_DIRECTORY = path.resolve(
  CURRENT_DIRECTORY,
  "../../../data/music-map-exports"
);
const CSV_AUDIO_FEATURE_COLUMNS = [
  ...new Set([...MUSIC_MAP_FEATURE_KEYS, "timeSignature"]),
];
const CSV_COLUMNS = [
  "rank",
  "spotify_id",
  "track_name",
  "artists",
  "album",
  "duration_ms",
  "popularity",
  "explicit",
  "spotify_url",
  "reccobeats_id",
  "audio_features_error",
  ...CSV_AUDIO_FEATURE_COLUMNS.map(toSnakeCase),
];

export async function exportTopTracksAudioFeaturesCsv({
  accessToken,
  limit,
  timeRange,
  exportDirectory = DEFAULT_EXPORT_DIRECTORY,
}) {
  const { tracks, audioFeatures, metadata } =
    await getTopTracksWithAudioFeatures({
      accessToken,
      limit,
      timeRange,
    });
  const audioFeaturesBySpotifyId = new Map(
    audioFeatures
      .filter((features) => features?.spotifyId)
      .map((features) => [features.spotifyId, features])
  );
  const rows = tracks.map((track, index) =>
    mapTrackToCsvRow(track, audioFeaturesBySpotifyId.get(track.id), index)
  );
  const fileName = buildExportFileName({ limit, timeRange });
  const filePath = path.join(exportDirectory, fileName);

  await mkdir(exportDirectory, { recursive: true });
  await writeFile(filePath, buildCsv(rows), "utf8");

  return {
    fileName,
    filePath,
    rowsCount: rows.length,
    rowsWithAudioFeaturesCount: rows.filter((row) => !row.audio_features_error)
      .length,
    rowsWithoutAudioFeaturesCount: rows.filter(
      (row) => row.audio_features_error
    ).length,
    ...metadata,
  };
}

function mapTrackToCsvRow(track, audioFeatures, index) {
  const row = {
    rank: index + 1,
    spotify_id: track.id,
    track_name: track.name,
    artists: (track.artists ?? []).map((artist) => artist.name).join("; "),
    album: track.album?.name ?? "",
    duration_ms: track.duration_ms ?? "",
    popularity: track.popularity ?? "",
    explicit: track.explicit ?? "",
    spotify_url: track.external_urls?.spotify ?? "",
    reccobeats_id: audioFeatures?.id ?? "",
    audio_features_error: audioFeatures?.error ?? "",
  };

  for (const feature of CSV_AUDIO_FEATURE_COLUMNS) {
    row[toSnakeCase(feature)] =
      typeof audioFeatures?.[feature] === "number"
        ? audioFeatures[feature]
        : "";
  }

  return row;
}

function buildCsv(rows) {
  return [
    CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      CSV_COLUMNS.map((column) => escapeCsvValue(row[column])).join(",")
    ),
  ].join("\n");
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function buildExportFileName({ limit, timeRange }) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");

  return `spotify-top-tracks-${timeRange}-${limit}-${timestamp}.csv`;
}

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
