import type {
  LastfmTrackInfo,
  LastfmTrackNameIdentifier,
} from "@application/lastfm/types.js";

/** Skrócone dane utworu prezentowane przez aplikację. */
type MusicProfileSpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
};

/** Dane Spotify przygotowane do dalszego pobrania informacji o utworze. */
type MusicProfileSpotifyLookup = {
  track: MusicProfileSpotifyTrack;
  metadataIdentifier: LastfmTrackNameIdentifier;
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
  getTrackInfo(identifier: LastfmTrackNameIdentifier): Promise<LastfmTrackInfo>;
};

export type {
  MusicProfileSpotifyTrack,
  MusicProfileSpotifyLookup,
  MusicProfileSpotifyReader,
  MusicProfileMetadataReader,
};
