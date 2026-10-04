import type { TimeRange } from '@core/api/spotify/spotify.models';

type MusicMapClusterSelectionSource = 'silhouette-score' | 'manual' | 'fallback';

interface MusicMapCandidateClusterResult {
  k: number;
  inertia: number;
  silhouetteScore: number;
}

interface MusicMapCluster {
  id: number;
  label: string;
  description: string;
  averageAudioFeatures: Partial<Record<string, number>>;
  tracksCount: number;
  trackIds: string[];
}

interface MusicMapPoint {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
  description: string;
  clusterDescription: string;
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  cluster: number;
  audioFeatures: Partial<Record<string, number>>;
}

interface MusicMapSkippedTrack {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  spotifyUrl: string | null;
  reason: string;
}

interface MusicMapResponse {
  source: 'spotify-top-tracks-reccobeats-audio-features';
  timeRange: TimeRange;
  requestedLimit: number;
  spotifyReturnedTracksCount: number;
  spotifyTotalTracksCount: number;
  requestedClusterCount: number | null;
  selectedClusterCount: number;
  selectedClusterCountSource: MusicMapClusterSelectionSource;
  appliedClusterCount: number;
  candidateClusterResults: MusicMapCandidateClusterResult[];
  featureKeys: string[];
  activeFeatureKeys: string[];
  explainedVariance: number[];
  tracksWithAudioFeaturesCount: number;
  skippedTracksCount: number;
  clusters: MusicMapCluster[];
  points: MusicMapPoint[];
  skippedTracks: MusicMapSkippedTrack[];
}

type MusicMapAxisTick = {
  value: number;
  label: string;
  x: number;
  y: number;
};

type MusicMapClusterMetric = {
  label: string;
  value: string;
};

type MusicMapClusterDetail = {
  cluster: MusicMapCluster;
  points: MusicMapPoint[];
  metrics: MusicMapClusterMetric[];
};

const MUSIC_MAP_CLUSTER_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
];

export { MUSIC_MAP_CLUSTER_COLORS };
export type {
  MusicMapClusterSelectionSource,
  MusicMapCandidateClusterResult,
  MusicMapCluster,
  MusicMapPoint,
  MusicMapSkippedTrack,
  MusicMapResponse,
  MusicMapAxisTick,
  MusicMapClusterMetric,
  MusicMapClusterDetail,
};
