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

export type {
  LastfmTrackInfo,
  SpotifyTrackSummary,
  SpotifyLastfmTrackResponse,
  ArtistGenreDistributionSubgenreItem,
  ArtistGenreDistributionItem,
  ArtistGenreDistributionResponse,
};
