import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";
import { getCurrentUserTopTracks } from "../../integrations/spotify/spotify.service.js";
import {
  describeAudioCharacter,
  describeClusterName,
} from "./music-map-descriptions.js";
import { analyzeMusicMapRows } from "./music-map-analysis.js";

export const MUSIC_MAP_FEATURE_KEYS = [
  "acousticness",
  "danceability",
  "energy",
  "instrumentalness",
  "liveness",
  "speechiness",
  "valence",
  "loudness",
  "tempo",
  "key",
  "mode",
];

const METHODOLOGY_TEXT =
  "Mapa została utworzona na podstawie cech audio utworów. Liczbę klastrów można ustawić suwakiem, a wyniki silhouette score i inertia pomagają ocenić podział. Pozycje punktów wyznaczono metodą PCA.";

export async function buildMusicMap({
  accessToken,
  limit,
  timeRange,
  clusterCount,
}) {
  const { tracks, audioFeatures, metadata } =
    await getTopTracksWithAudioFeatures({
      accessToken,
      limit,
      timeRange,
    });

  return buildMusicMapProjection({
    tracks,
    audioFeatures,
    requestedClusterCount: clusterCount,
    metadata,
  });
}

export async function getTopTracksWithAudioFeatures({
  accessToken,
  limit,
  timeRange,
}) {
  const topTracks = await getCurrentUserTopTracks(accessToken, {
    limit,
    timeRange,
  });
  const tracks = topTracks.items ?? [];
  const trackIds = tracks.map((track) => track.id).filter(Boolean);
  const audioFeatures = trackIds.length
    ? await getManyTrackAudioFeaturesBySpotifyIds(trackIds)
    : [];

  return {
    topTracks,
    tracks,
    audioFeatures,
    metadata: {
      timeRange,
      requestedLimit: limit,
      spotifyReturnedTracksCount: tracks.length,
      spotifyTotalTracksCount: topTracks.total ?? tracks.length,
    },
  };
}

export function buildMusicMapProjection({
  tracks,
  audioFeatures,
  requestedClusterCount = null,
  metadata = {},
}) {
  const audioFeaturesBySpotifyId = new Map(
    audioFeatures
      .filter((features) => features?.spotifyId)
      .map((features) => [features.spotifyId, features])
  );
  const rows = tracks.map((track) =>
    buildTrackFeatureRow(track, audioFeaturesBySpotifyId)
  );
  const validRows = rows.filter((row) => row.vector);
  const skippedTracks = rows
    .filter((row) => !row.vector)
    .map(({ vector, ...row }) => row);
  const analysis = analyzeMusicMapRows({
    rows: validRows,
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    requestedClusterCount,
  });
  const normalizedPoints = normalizeProjectedCoordinates(analysis.coordinates);
  const clusters = buildClusterSummaries(validRows, analysis.clusterLabels);
  const clusterDescriptionsById = new Map(
    clusters.map((cluster) => [cluster.id, cluster.description])
  );

  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    methodologyText: METHODOLOGY_TEXT,
    ...metadata,
    requestedClusterCount,
    selectedClusterCount: analysis.selectedClusterCount,
    selectedClusterCountSource: analysis.selectedClusterCountSource,
    appliedClusterCount: getAppliedClusterCount(analysis.clusterLabels),
    candidateClusterResults: analysis.candidateClusterResults,
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    activeFeatureKeys: analysis.activeFeatureKeys,
    explainedVariance: analysis.explainedVariance,
    tracksWithAudioFeaturesCount: validRows.length,
    skippedTracksCount: skippedTracks.length,
    clusters,
    points: validRows.map((row, index) => {
      const cluster = analysis.clusterLabels[index] ?? 0;

      return {
        id: row.id,
        name: row.name,
        artists: row.artists,
        album: row.album,
        imageUrl: row.imageUrl,
        spotifyUrl: row.spotifyUrl,
        description: row.description,
        clusterDescription: clusterDescriptionsById.get(cluster) ?? "",
        x: normalizedPoints[index].x,
        y: normalizedPoints[index].y,
        rawX: round(analysis.coordinates[index]?.[0] ?? 0),
        rawY: round(analysis.coordinates[index]?.[1] ?? 0),
        cluster,
        audioFeatures: row.audioFeatures,
      };
    }),
    skippedTracks,
  };
}

function buildTrackFeatureRow(track, audioFeaturesBySpotifyId) {
  const features = audioFeaturesBySpotifyId.get(track.id);
  const baseTrack = {
    id: track.id,
    name: track.name,
    artists: (track.artists ?? []).map((artist) => artist.name),
    album: track.album?.name ?? null,
    imageUrl: track.album?.images?.[0]?.url ?? null,
    spotifyUrl: track.external_urls?.spotify ?? null,
  };

  if (!features || features.error) {
    return {
      ...baseTrack,
      reason: features?.error ?? "Audio features not found",
      vector: null,
    };
  }

  const vector = MUSIC_MAP_FEATURE_KEYS.map((key) => features[key]);

  if (vector.some((value) => typeof value !== "number")) {
    return {
      ...baseTrack,
      reason: "Incomplete audio features",
      vector: null,
    };
  }

  const audioFeatures = Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key, index) => [key, round(vector[index])])
  );

  return {
    ...baseTrack,
    vector,
    audioFeatures,
    description: describeAudioCharacter(audioFeatures),
  };
}

function buildClusterSummaries(rows, clusterLabels) {
  const groupedRows = new Map();

  rows.forEach((row, index) => {
    const cluster = clusterLabels[index] ?? 0;
    const clusterRows = groupedRows.get(cluster) ?? [];

    clusterRows.push(row);
    groupedRows.set(cluster, clusterRows);
  });

  return [...groupedRows.entries()]
    .sort(([leftCluster], [rightCluster]) => leftCluster - rightCluster)
    .map(([cluster, clusterRows]) => {
      const audioFeatures = averageAudioFeatures(clusterRows);

      return {
        id: cluster,
        label: describeClusterName(audioFeatures),
        description: describeAudioCharacter(audioFeatures),
        averageAudioFeatures: audioFeatures,
        tracksCount: clusterRows.length,
        trackIds: clusterRows.map((row) => row.id),
      };
    });
}

function averageAudioFeatures(rows) {
  return Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key) => [
      key,
      round(average(rows.map((row) => row.audioFeatures[key]))),
    ])
  );
}

function normalizeProjectedCoordinates(coordinates) {
  const xValues = coordinates.map(([x]) => x);
  const yValues = coordinates.map(([, y]) => y);
  const xMin = Math.min(...xValues, 0);
  const xMax = Math.max(...xValues, 0);
  const yMin = Math.min(...yValues, 0);
  const yMax = Math.max(...yValues, 0);

  return coordinates.map(([x, y]) => ({
    x: round(normalizeToUnitRange(x, xMin, xMax)),
    y: round(normalizeToUnitRange(y, yMin, yMax)),
  }));
}

function normalizeToUnitRange(value, min, max) {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 2 - 1;
}

function getAppliedClusterCount(clusterLabels) {
  return new Set(clusterLabels).size;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
