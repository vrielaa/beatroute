import type { TimeRange } from '@core/api/spotify/spotify.models';

/** Nazwa cechy audio wykorzystywanej do budowania mapy muzycznej. */
type MusicMapFeatureKey =
  | 'acousticness'
  | 'danceability'
  | 'energy'
  | 'instrumentalness'
  | 'liveness'
  | 'speechiness'
  | 'valence'
  | 'loudness'
  | 'tempo'
  | 'key'
  | 'mode';

/** Dane utworu niezależne od formatu odpowiedzi Spotify. */
interface MusicMapTrack {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

/** Cechy audio znalezione dla wskazanego utworu. */
interface FoundMusicMapAudioFeatures {
  status: 'found';
  trackId: string;
  features: Partial<Record<MusicMapFeatureKey, number | null>>;
}

/** Informacja o nieudanym pobraniu cech audio utworu. */
interface FailedMusicMapAudioFeatures {
  status: 'failed';
  trackId: string;
  reason: string;
}

/** Wynik wyszukania cech audio jednego utworu. */
type MusicMapAudioFeaturesLookup = FoundMusicMapAudioFeatures | FailedMusicMapAudioFeatures;

/** Metadane opisujące zakres danych pobranych do analizy. */
interface MusicMapMetadata {
  timeRange: TimeRange;
  requestedLimit: number;
  spotifyReturnedTracksCount: number;
  spotifyTotalTracksCount: number;
}

/** Utwory i cechy audio, które mogą być wielokrotnie analizowane bez ponownego wywołania API. */
interface MusicMapDataset {
  tracks: MusicMapTrack[];
  audioFeatures: MusicMapAudioFeaturesLookup[];
  metadata: MusicMapMetadata;
}

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
  MusicMapFeatureKey,
  MusicMapTrack,
  FoundMusicMapAudioFeatures,
  FailedMusicMapAudioFeatures,
  MusicMapAudioFeaturesLookup,
  MusicMapMetadata,
  MusicMapDataset,
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
