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
};
