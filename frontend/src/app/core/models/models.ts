export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export interface TopTracksResponse {
  items: {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    duration_ms: number;
    popularity: number;
  }[];
}

export type AudioFeatures = {
  uuid?: string;
  acousticness: number | null;
  danceability: number | null;
  energy: number | null;
  instrumentalness: number | null;
  key: number | null;
  liveness: number | null;
  loudness: number | null;
  mode: number | null;
  speechiness: number | null;
  tempo: number | null;
  time_signature: number | null;
  valence: number | null;
};

export type MultipleAudioFeaturesResponse = {
  audio_features: AudioFeatures[];
};
