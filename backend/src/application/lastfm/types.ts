/** Znormalizowany tag otrzymany z Last.fm. */
type LastfmTag = {
  name: string;
  url: string | null;
};

/** Identyfikator utworu złożony z nazwy artysty i utworu. */
type LastfmTrackNameIdentifier = {
  mbid?: never;
  artist: string;
  track: string;
};

/** Identyfikator utworu akceptowany przez Last.fm. */
type LastfmTrackIdentifier =
  | {
      mbid: string;
      artist?: never;
      track?: never;
    }
  | LastfmTrackNameIdentifier;

/** Metadane utworu po sprawdzeniu odpowiedzi zewnętrznego API. */
type LastfmTrackMetadata = {
  name: string | null;
  artist: string | null;
  mbid: string | null;
  url: string | null;
  tags: LastfmTag[];
};

/** Źródło tagów wykorzystanych do rozpoznania gatunku utworu. */
type LastfmGenreSource =
  | "lastfm-top-tags"
  | "lastfm-track-top-tags"
  | "lastfm-artist-info-tags"
  | null;

/** Metadane i wynik klasyfikacji gatunkowej jednego utworu. */
type LastfmTrackInfo = LastfmTrackMetadata & {
  genre: string | null;
  genreCandidates: string[];
  genreSource: LastfmGenreSource;
  genreIsFallback: boolean;
};

export type {
  LastfmTag,
  LastfmTrackNameIdentifier,
  LastfmTrackIdentifier,
  LastfmTrackMetadata,
  LastfmGenreSource,
  LastfmTrackInfo,
};
