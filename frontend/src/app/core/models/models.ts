type TimeRange = 'short_term' | 'medium_term' | 'long_term';

interface SpotifyExternalUrls {
  spotify: string;
}

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyFollowers {
  total: number;
}

interface SpotifyUserProfile {
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

interface TopTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: SpotifyImage[] };
  duration_ms: number;
  popularity: number;
}

interface TopTracksResponse {
  href: string;
  items: TopTrack[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

interface TopArtist {
  id: string;
  name: string;
  genres: string[];
  images: SpotifyImage[];
  followers: SpotifyFollowers;
  popularity: number;
  external_urls: SpotifyExternalUrls;
}

interface TopArtistsResponse {
  href: string;
  items: TopArtist[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

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

interface LastfmTrackInfo {
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

interface SpotifyTrackSummary {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
}

interface SpotifyLastfmTrackResponse {
  spotify: SpotifyTrackSummary;
  lastfm: LastfmTrackInfo;
}

interface ArtistGenreDistributionSubgenreItem {
  name: string;
  count: number;
  percentage: number;
  artists: string[];
}

interface ArtistGenreDistributionItem extends ArtistGenreDistributionSubgenreItem {
  subgenres: ArtistGenreDistributionSubgenreItem[];
}

interface ArtistGenreDistributionResponse {
  genres: ArtistGenreDistributionItem[];
  totalArtists: number;
  matchedArtists: number;
  totalGenreMatches: number;
  unmatchedArtists: string[];
  source: 'lastfm-artist-info-tags';
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

export type {
  TimeRange,
  SpotifyExternalUrls,
  SpotifyImage,
  SpotifyFollowers,
  SpotifyUserProfile,
  TopTrack,
  TopTracksResponse,
  TopArtist,
  TopArtistsResponse,
  AudioFeatures,
  MultipleAudioFeaturesResponse,
  AudioStats,
  LastfmTrackInfo,
  SpotifyTrackSummary,
  SpotifyLastfmTrackResponse,
  ArtistGenreDistributionSubgenreItem,
  ArtistGenreDistributionItem,
  ArtistGenreDistributionResponse,
  MusicMapClusterSelectionSource,
  MusicMapCandidateClusterResult,
  MusicMapCluster,
  MusicMapPoint,
  MusicMapSkippedTrack,
  MusicMapResponse,
};
