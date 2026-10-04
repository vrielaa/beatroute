import type {
  LastfmTag,
  LastfmTrackInfo,
  LastfmTrackNameIdentifier,
} from "@application/lastfm/types.js";

type MusicProfileTrackIdentifier = LastfmTrackNameIdentifier;

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
type MusicProfileTag = LastfmTag;

/** Informacje gatunkowe i metadane jednego utworu. */
type MusicProfileTrackInfo = LastfmTrackInfo;

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
