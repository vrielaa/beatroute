import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";
import { getCurrentUserTopTracks } from "../../integrations/spotify/spotify.service.js";
import {
  describeAudioCharacter,
  describeClusterName,
} from "./music-map-descriptions.js";
import { analyzeMusicMapRows } from "./music-map-analysis.js";
import type {
  AudioFeatureValues,
  BuildMusicMapInput,
  BuildMusicMapPointsInput,
  Coordinate,
  GetTopTracksInput,
  MusicMapAnalysis,
  MusicMapCluster,
  MusicMapFeatureKey,
  MusicMapPoint,
  MusicMapProjection,
  MusicMapProjectionInput,
  MusicMapSkippedTrack,
  NormalizedPoint,
  SpotifyTopTracksResponse,
  SpotifyTrack,
  TrackAudioFeatures,
  TrackFeatureRow,
  TopTracksWithAudioFeaturesResult,
  ValidTrackFeatureRow,
} from "./music-map.types.js";

export const MUSIC_MAP_FEATURE_KEYS: MusicMapFeatureKey[] = [
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
}: BuildMusicMapInput): Promise<MusicMapProjection> {
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
}: GetTopTracksInput): Promise<TopTracksWithAudioFeaturesResult> {
  const topTracks = (await getCurrentUserTopTracks(accessToken, {
    limit,
    timeRange,
  })) as SpotifyTopTracksResponse;
  const tracks = topTracks.items ?? [];
  const trackIds = tracks.map((track) => track.id).filter(Boolean);
  const audioFeatures: TrackAudioFeatures[] = trackIds.length
    ? ((await getManyTrackAudioFeaturesBySpotifyIds(
        trackIds
      )) as TrackAudioFeatures[])
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
}: MusicMapProjectionInput): MusicMapProjection {
  const audioFeaturesBySpotifyId = indexAudioFeaturesBySpotifyId(audioFeatures);
  const trackRows = tracks.map((track) =>
    buildTrackFeatureRow(track, audioFeaturesBySpotifyId)
  );
  const { validRows, skippedTracks } = partitionTrackRows(trackRows);

  const analysis = analyzeMusicMapRows({
    rows: validRows,
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    requestedClusterCount,
  }) as MusicMapAnalysis;

  const normalizedPoints = normalizeProjectedCoordinates(analysis.coordinates);
  const clusters = buildClusterSummaries(validRows, analysis.clusterLabels);
  const points = buildMusicMapPoints({
    rows: validRows,
    clusterLabels: analysis.clusterLabels,
    coordinates: analysis.coordinates,
    normalizedPoints,
    clusters,
  });

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
    points,
    skippedTracks,
  };
}

function indexAudioFeaturesBySpotifyId(
  audioFeatures: TrackAudioFeatures[]
): Map<string, TrackAudioFeatures> {
  const indexedFeatures = new Map<string, TrackAudioFeatures>();

  for (const features of audioFeatures) {
    indexedFeatures.set(features.spotifyId, features);
  }

  return indexedFeatures;
}

function partitionTrackRows(rows: TrackFeatureRow[]): {
  validRows: ValidTrackFeatureRow[];
  skippedTracks: MusicMapSkippedTrack[];
} {
  const validRows: ValidTrackFeatureRow[] = [];
  const skippedTracks: MusicMapSkippedTrack[] = [];

  for (const row of rows) {
    if (row.vector) {
      validRows.push(row);
      continue;
    }

    const { vector, ...skippedTrack } = row;
    skippedTracks.push(skippedTrack);
  }

  return { validRows, skippedTracks };
}

function buildMusicMapPoints({
  rows,
  clusterLabels,
  coordinates,
  normalizedPoints,
  clusters,
}: BuildMusicMapPointsInput): MusicMapPoint[] {
  const clusterDescriptionsById = new Map<number, string>(
    clusters.map((cluster) => [cluster.id, cluster.description])
  );

  return rows.map((row, index) => {
    const cluster = clusterLabels[index] ?? 0;
    const normalizedPoint = normalizedPoints[index] ?? { x: 0, y: 0 };
    const [rawX = 0, rawY = 0] = coordinates[index] ?? [];

    return {
      id: row.id,
      name: row.name,
      artists: row.artists,
      album: row.album,
      imageUrl: row.imageUrl,
      spotifyUrl: row.spotifyUrl,
      description: row.description,
      clusterDescription: clusterDescriptionsById.get(cluster) ?? "",
      x: normalizedPoint.x,
      y: normalizedPoint.y,
      rawX: round(rawX),
      rawY: round(rawY),
      cluster,
      audioFeatures: row.audioFeatures,
    };
  });
}

function buildTrackFeatureRow(
  track: SpotifyTrack,
  audioFeaturesBySpotifyId: Map<string, TrackAudioFeatures>
): TrackFeatureRow {
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

  if (!vector.every(isNumber)) {
    return {
      ...baseTrack,
      reason: "Incomplete audio features",
      vector: null,
    };
  }

  const audioFeatures = Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key, index) => [key, round(vector[index])])
  ) as AudioFeatureValues;

  return {
    ...baseTrack,
    vector,
    audioFeatures,
    description: describeAudioCharacter(audioFeatures),
  };
}

function buildClusterSummaries(
  rows: ValidTrackFeatureRow[],
  clusterLabels: number[]
): MusicMapCluster[] {
  const groupedRows = new Map<number, ValidTrackFeatureRow[]>();

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

function averageAudioFeatures(
  rows: ValidTrackFeatureRow[]
): AudioFeatureValues {
  return Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key) => [
      key,
      round(average(rows.map((row) => row.audioFeatures[key]))),
    ])
  ) as AudioFeatureValues;
}

function normalizeProjectedCoordinates(
  coordinates: Coordinate[]
): NormalizedPoint[] {
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

function normalizeToUnitRange(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 2 - 1;
}

function getAppliedClusterCount(clusterLabels: number[]): number {
  return new Set(clusterLabels).size;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}
