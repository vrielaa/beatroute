export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export interface SpotifyExternalUrls {
  spotify: string;
}

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyFollowers {
  total: number;
}

export interface SpotifyUserProfile {
  id: string;
  display_name?: string | null;
  email?: string | null;
  country?: string | null;
  images?: SpotifyImage[];
  external_urls?: SpotifyExternalUrls;
  followers?: SpotifyFollowers;
  href?: string;
  type?: string;
  uri?: string;
}

export interface TopTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: SpotifyImage[] };
  duration_ms: number;
  popularity: number;
}

export interface TopTracksResponse {
  href: string;
  items: TopTrack[];
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
  images: SpotifyImage[];
  followers: SpotifyFollowers;
  popularity: number;
  external_urls: SpotifyExternalUrls;
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

export interface LastfmTrackInfo {
  name: string | null;
  artist: string | null;
  mbid: string | null;
  url: string | null;
  genre: string | null;
  genreCandidates: string[];
  tags: { name: string; url: string | null }[];
  genreSource: 'lastfm-top-tags' | 'lastfm-track-top-tags' | 'lastfm-artist-info-tags' | null;
  genreIsFallback: boolean;
}

export interface SpotifyTrackSummary {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
}

export interface SpotifyLastfmTrackResponse {
  spotify: SpotifyTrackSummary;
  lastfm: LastfmTrackInfo;
}

export interface ArtistGenreDistributionSubgenreItem {
  name: string;
  count: number;
  percentage: number;
  artists: string[];
}

export interface ArtistGenreDistributionItem extends ArtistGenreDistributionSubgenreItem {
  subgenres: ArtistGenreDistributionSubgenreItem[];
}

export interface ArtistGenreDistributionResponse {
  genres: ArtistGenreDistributionItem[];
  totalArtists: number;
  matchedArtists: number;
  totalGenreMatches: number;
  unmatchedArtists: string[];
  source: 'lastfm-artist-info-tags';
}
