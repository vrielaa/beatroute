export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export interface TopTracksResponse {
  href: string;
  items: {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    duration_ms: number;
    popularity: number;
  }[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface TopArtist {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; height: number | null; width: number | null }[];
  followers: { total: number };
  popularity: number;
  external_urls: { spotify: string };
}

export interface TopArtistsResponse {
  href: string;
  items: TopArtist[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
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

export type AudioStats = {
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
