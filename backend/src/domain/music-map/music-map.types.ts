export type MusicMapTimeRange = "short_term" | "medium_term" | "long_term";

export type MusicMapFeatureKey =
  | "acousticness"
  | "danceability"
  | "energy"
  | "instrumentalness"
  | "liveness"
  | "speechiness"
  | "valence"
  | "loudness"
  | "tempo"
  | "key"
  | "mode";

export type AudioFeatureValues = Record<MusicMapFeatureKey, number>;

export type TrackAudioFeatures = Partial<
  Record<MusicMapFeatureKey, number | null>
> & {
  id?: string;
  spotifyId: string;
  error?: string;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists?: Array<{ name: string }>;
  album?: {
    name?: string;
    images?: Array<{ url: string }>;
  };
  external_urls?: { spotify?: string };
};

export type SpotifyTopTracksResponse = {
  items?: SpotifyTrack[];
  total?: number;
};

export type MusicMapMetadata = {
  timeRange: MusicMapTimeRange;
  requestedLimit: number;
  spotifyReturnedTracksCount: number;
  spotifyTotalTracksCount: number;
};

export type MusicMapTrackDetails = {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

export type AnalyzableTrack = MusicMapTrackDetails & {
  vector: number[];
  audioFeatures: AudioFeatureValues;
  description: string;
};

export type UnanalyzableTrack = MusicMapTrackDetails & {
  vector: null;
  reason: string;
};

export type PreparedMusicMapTrack = AnalyzableTrack | UnanalyzableTrack;
export type MusicMapSkippedTrack = Omit<UnanalyzableTrack, "vector">;
export type Coordinate = [number, number];
export type NormalizedPoint = { x: number; y: number };
export type NumericMatrix = number[][];

export type MusicMapCoordinates = {
  coordinates: Coordinate[];
  explainedVariance: number[];
};

export type ClusteringResult = {
  clusters: number[];
  centroids: number[][];
};

export type MusicMapClusterSelectionSource =
  | "silhouette-score"
  | "manual"
  | "fallback";

export type MusicMapCandidateClusterResult = {
  k: number;
  inertia: number;
  silhouetteScore: number;
};

export type MusicMapAnalysis = {
  activeFeatureKeys: MusicMapFeatureKey[];
  selectedClusterCount: number;
  selectedClusterCountSource: MusicMapClusterSelectionSource;
  candidateClusterResults: MusicMapCandidateClusterResult[];
  clusterLabels: number[];
  coordinates: Coordinate[];
  explainedVariance: number[];
};

export type MusicMapCluster = {
  id: number;
  label: string;
  description: string;
  averageAudioFeatures: AudioFeatureValues;
  tracksCount: number;
  trackIds: string[];
};

export type MusicMapPoint = MusicMapTrackDetails & {
  description: string;
  clusterDescription: string;
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  cluster: number;
  audioFeatures: AudioFeatureValues;
};

export type MusicMapSourceData = {
  topTracks: SpotifyTopTracksResponse;
  tracks: SpotifyTrack[];
  audioFeatures: TrackAudioFeatures[];
  metadata: MusicMapMetadata;
};

export type MusicMapProjection = Partial<MusicMapMetadata> & {
  source: "spotify-top-tracks-reccobeats-audio-features";
  requestedClusterCount: number | null;
  selectedClusterCount: number;
  selectedClusterCountSource: MusicMapClusterSelectionSource;
  appliedClusterCount: number;
  candidateClusterResults: MusicMapCandidateClusterResult[];
  featureKeys: MusicMapFeatureKey[];
  activeFeatureKeys: MusicMapFeatureKey[];
  explainedVariance: number[];
  tracksWithAudioFeaturesCount: number;
  skippedTracksCount: number;
  clusters: MusicMapCluster[];
  points: MusicMapPoint[];
  skippedTracks: MusicMapSkippedTrack[];
};

export type MusicMapRequest = {
  accessToken: string;
  limit: number;
  timeRange: MusicMapTimeRange;
  clusterCount: number | null;
};

export type TopTracksSelection = {
  accessToken: string;
  limit: number;
  timeRange: MusicMapTimeRange;
};

export type MusicMapProjectionData = {
  tracks: SpotifyTrack[];
  audioFeatures: TrackAudioFeatures[];
  requestedClusterCount?: number | null;
  metadata?: Partial<MusicMapMetadata>;
};

export type MusicMapPointContext = {
  tracks: AnalyzableTrack[];
  clusterLabels: number[];
  coordinates: Coordinate[];
  normalizedPoints: NormalizedPoint[];
  clusters: MusicMapCluster[];
};
