import { MusicMapCluster, MusicMapResponse } from '@core/models/models';
import { MusicMapClusterDetail, MusicMapClusterMetric } from './music-map.models';

const MUSIC_MAP_CLUSTER_LIMITS = {
  default: 4,
  min: 2,
  max: 8,
} as const;

function getMaxMusicMapClusterCount(tracksCount: number): number {
  return Math.max(
    MUSIC_MAP_CLUSTER_LIMITS.min,
    Math.min(MUSIC_MAP_CLUSTER_LIMITS.max, tracksCount - 1)
  );
}

function clampMusicMapClusterCount(value: number, max: number): number {
  return Math.min(Math.max(value, MUSIC_MAP_CLUSTER_LIMITS.min), max);
}

function buildMusicMapClusterDetails(musicMap: MusicMapResponse | null): MusicMapClusterDetail[] {
  if (!musicMap) return [];

  return musicMap.clusters.map((cluster) => ({
    cluster,
    points: musicMap.points.filter((point) => point.cluster === cluster.id),
    metrics: buildClusterMetrics(cluster),
  }));
}

function buildClusterMetrics(cluster: MusicMapCluster): MusicMapClusterMetric[] {
  const features = cluster.averageAudioFeatures;

  return [
    { label: 'Śr. energia', value: formatPercentage(features['energy']) },
    { label: 'Śr. taneczność', value: formatPercentage(features['danceability']) },
    { label: 'Śr. nastrój', value: formatPercentage(features['valence']) },
    { label: 'Śr. tempo', value: formatBpm(features['tempo']) },
  ];
}

function formatPercentage(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Brak danych';
}

function formatBpm(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value)} BPM` : 'Brak danych';
}

export {
  MUSIC_MAP_CLUSTER_LIMITS,
  getMaxMusicMapClusterCount,
  clampMusicMapClusterCount,
  buildMusicMapClusterDetails,
};
