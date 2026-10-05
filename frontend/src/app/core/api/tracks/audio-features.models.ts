type AudioFeatures = {
  id?: string;
  spotifyId?: string;
  uuid?: string;
  acousticness?: number | null;
  danceability?: number | null;
  energy?: number | null;
  instrumentalness?: number | null;
  key?: number | null;
  liveness?: number | null;
  loudness?: number | null;
  mode?: number | null;
  speechiness?: number | null;
  tempo?: number | null;
  timeSignature?: number | null;
  valence?: number | null;
  error?: string;
};

type MultipleAudioFeaturesResponse = {
  audio_features: AudioFeatures[];
};

type AudioStats = {
  trackCount: number;
  averageBpm: number | null;
  averageEnergy: number | null;
  averageDanceability: number | null;
  averageValence: number | null;
  averageAcousticness: number | null;
  averageInstrumentalness: number | null;
  averageLiveness: number | null;
  averageSpeechiness: number | null;
  averageLoudness: number | null;
  dominantKey: number | null;
  dominantMode: number | null;
  majorPercentage: number;
  minorPercentage: number;
  dominantTimeSignature: number | null;
  liveTrackPercentage: number;
  instrumentalTrackPercentage: number;
  speechHeavyTrackPercentage: number;
  foundTracksCount: number;
  totalTracksCount: number;
};

type TrackAnalysisResponse = {
  stats: AudioStats;
  audioFeatures: AudioFeatures[];
};

export type { AudioFeatures, MultipleAudioFeaturesResponse, AudioStats, TrackAnalysisResponse };
