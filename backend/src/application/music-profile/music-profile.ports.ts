/** Identyfikator tekstowy utworu używany do pobrania jego metadanych. */
type MusicProfileTrackIdentifier = {
  artist: string;
  track: string;
};

/** Skrócone dane utworu prezentowane przez aplikację. */
type MusicProfileSpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
};

/** Tag przypisany do utworu przez zewnętrzne źródło metadanych. */
type MusicProfileTag = {
  name: string;
  url: string | null;
};

/** Informacje gatunkowe i metadane jednego utworu. */
type MusicProfileTrackInfo = {
  name: string | null;
  artist: string | null;
  mbid: string | null;
  url: string | null;
  genre: string | null;
  genreCandidates: string[];
  tags: MusicProfileTag[];
  genreSource:
    | "lastfm-top-tags"
    | "lastfm-track-top-tags"
    | "lastfm-artist-info-tags"
    | null;
  genreIsFallback: boolean;
};

/** Dane Spotify przygotowane do dalszego pobrania informacji o utworze. */
type MusicProfileSpotifyLookup = {
  track: MusicProfileSpotifyTrack;
  metadataIdentifier: MusicProfileTrackIdentifier;
};

/** Port udostępniający dane jednego utworu Spotify. */
type MusicProfileSpotifyReader = {
  getTrack(
    spotifyTrackId: string,
    accessToken: string
  ): Promise<MusicProfileSpotifyLookup>;
};

/** Port udostępniający metadane i klasyfikację gatunkową utworu. */
type MusicProfileMetadataReader = {
  getTrackInfo(
    identifier: MusicProfileTrackIdentifier
  ): Promise<MusicProfileTrackInfo>;
};

export type {
  MusicProfileTrackIdentifier,
  MusicProfileSpotifyTrack,
  MusicProfileTag,
  MusicProfileTrackInfo,
  MusicProfileSpotifyLookup,
  MusicProfileSpotifyReader,
  MusicProfileMetadataReader,
};
