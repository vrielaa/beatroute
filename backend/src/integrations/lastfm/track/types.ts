import type {
  LastfmGenreSource,
  LastfmTag,
  LastfmTrackIdentifier,
  LastfmTrackInfo,
  LastfmTrackMetadata,
} from "@application/lastfm/types.js";
import type { LastfmTagApiResponse } from "../types.js";

/** Fragment surowej odpowiedzi `track.getInfo` używany przez aplikację. */
type LastfmTrackApiResponse = {
  /** Dane utworu; pole może być nieobecne w niepełnej odpowiedzi API. */
  track?: {
    /** Nazwa utworu zwrócona przez Last.fm. */
    name?: string;
    /** Identyfikator utworu w MusicBrainz. */
    mbid?: string;
    /** Adres strony utworu w Last.fm. */
    url?: string;
    /** Artysta przypisany do utworu przez Last.fm. */
    artist?: {
      /** Nazwa artysty, również po zastosowaniu autokorekty. */
      name?: string;
      /** Identyfikator artysty w MusicBrainz. */
      mbid?: string;
      /** Adres strony artysty w Last.fm. */
      url?: string;
    };
    /** Tagi osadzone bezpośrednio w odpowiedzi `track.getInfo`. */
    toptags?: {
      /** Pojedynczy tag albo tablica tagów z zewnętrznego API. */
      tag?: LastfmTagApiResponse | LastfmTagApiResponse[];
    };
  };
};

/** Fragment surowej odpowiedzi `track.getTopTags` używany przez aplikację. */
type LastfmTrackTopTagsApiResponse = {
  /** Kontener top tagów zwrócony przez osobną metodę Last.fm. */
  toptags?: {
    /** Pojedynczy tag albo tablica tagów z zewnętrznego API. */
    tag?: LastfmTagApiResponse | LastfmTagApiResponse[];
  };
};

/**
 * Zależności adaptera utworów Last.fm.
 *
 * @property fetchTrackInfo - Wykonuje zapytanie `track.getInfo`.
 * @property fetchTrackTopTags - Wykonuje zapytanie `track.getTopTags`.
 */
type LastfmTrackServiceDependencies = {
  fetchTrackInfo: (
    params: LastfmTrackRequestParams
  ) => Promise<LastfmTrackApiResponse>;

  fetchTrackTopTags: (
    params: LastfmTrackRequestParams
  ) => Promise<LastfmTrackTopTagsApiResponse>;
};

/** Parametry wysyłane do Last.fm po włączeniu automatycznej korekty nazw. */
type LastfmTrackRequestParams = LastfmTrackIdentifier & {
  /** Wartość `1` włącza poprawianie nazw przez Last.fm. */
  autocorrect: 1;
};

export type {
  LastfmTrackApiResponse,
  LastfmTrackMetadata,
  LastfmTrackInfo,
  LastfmTrackTopTagsApiResponse,
  LastfmGenreSource,
  LastfmTrackServiceDependencies,
  LastfmTrackIdentifier,
  LastfmTrackRequestParams,
};
