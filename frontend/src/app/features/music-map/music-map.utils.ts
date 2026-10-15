import type {
  MusicMapCluster,
  MusicMapClusterDetail,
  MusicMapClusterMetric,
  MusicMapResponse,
  MusicMapDataset,
} from './music-map.models';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import type { TopTracksCollection } from '@core/api/tracks/top-tracks.models';

const MUSIC_MAP_CLUSTER_LIMITS = {
  default: 4,
  min: 2,
  max: 8,
} as const;

/** Buduje zbiór PCA z już pobranych danych; nie przenosi identyfikatorów dostawcy do wektora cech. */
function buildCollectedMusicMapDataset(
  collection: TopTracksCollection,
  timeRange: TimeRange,
  requestedLimit: number
): MusicMapDataset {
  return {
    tracks: collection.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist) => artist.name),
      album: track.album?.name || null,
      imageUrl: track.album?.images?.[0]?.url ?? null,
      spotifyUrl: track.external_urls?.spotify ?? null,
    })),
    audioFeatures: collection.audioFeatures.map((audio) => ({
      status: 'found',
      trackId: audio.spotifyId,
      features: {
        acousticness: audio.acousticness ?? null,
        danceability: audio.danceability ?? null,
        energy: audio.energy ?? null,
        instrumentalness: audio.instrumentalness ?? null,
        liveness: audio.liveness ?? null,
        speechiness: audio.speechiness ?? null,
        valence: audio.valence ?? null,
        loudness: audio.loudness ?? null,
        tempo: audio.tempo ?? null,
        key: audio.key ?? null,
        mode: audio.mode ?? null,
      },
    })),
    metadata: {
      timeRange,
      requestedLimit,
      spotifyReturnedTracksCount: collection.tracks.length,
      spotifyTotalTracksCount: collection.progress.totalItems ?? 0,
    },
  };
}

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
  buildCollectedMusicMapDataset,
};
