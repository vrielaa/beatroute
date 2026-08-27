import type { LastfmTag, LastfmTagApiResponse } from "../types.js";

/** Fragment surowej odpowiedzi `track.getInfo` używany przez aplikację. */
export type LastfmTrackApiResponse = {
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

/** Metadane utworu po sprawdzeniu i znormalizowaniu odpowiedzi Last.fm. */
export type LastfmTrackMetadata = {
  /** Nazwa utworu albo `null`, jeśli odpowiedź jej nie zawiera. */
  name: string | null;
  /** Nazwa artysty z Last.fm, z zapytania albo `null`. */
  artist: string | null;
  /** Identyfikator MusicBrainz albo `null`. */
  mbid: string | null;
  /** Adres strony utworu w Last.fm albo `null`. */
  url: string | null;
  /** Wszystkie znormalizowane tagi osadzone w `track.getInfo`. */
  tags: LastfmTag[];
};

/** Informacje o utworze zwracane przez serwis do pozostałych warstw aplikacji. */
export type LastfmTrackInfo = {
  /** Nazwa utworu albo `null`. */
  name: string | null;
  /** Rozwiązana nazwa artysty albo `null`. */
  artist: string | null;
  /** Identyfikator MusicBrainz albo `null`. */
  mbid: string | null;
  /** Adres strony utworu w Last.fm albo `null`. */
  url: string | null;
  /** Nazwa pierwszego tagu rozpoznanego jako gatunek. */
  genre: string | null;
  /** Wszystkie tagi z wybranego źródła rozpoznane jako gatunki. */
  genreCandidates: string[];
  /** Wszystkie znormalizowane tagi z ostatecznie sprawdzanego źródła. */
  tags: LastfmTag[];
  /** Źródło tagów użytych do wyznaczenia gatunku. */
  genreSource: LastfmGenreSource;
  /** Informuje, czy gatunek pochodzi z tagów artysty zamiast utworu. */
  genreIsFallback: boolean;
};

/** Fragment surowej odpowiedzi `track.getTopTags` używany przez aplikację. */
export type LastfmTrackTopTagsApiResponse = {
  /** Kontener top tagów zwrócony przez osobną metodę Last.fm. */
  toptags?: {
    /** Pojedynczy tag albo tablica tagów z zewnętrznego API. */
    tag?: LastfmTagApiResponse | LastfmTagApiResponse[];
  };
};

/**
 * Źródło tagów, z których udało się wyznaczyć gatunek utworu:
 * `lastfm-top-tags` oznacza tagi osadzone w `track.getInfo`,
 * `lastfm-track-top-tags` oznacza wynik `track.getTopTags`, a
 * `lastfm-artist-info-tags` oznacza fallback do tagów artysty.
 * Wartość `null` informuje, że żadne źródło nie dostarczyło gatunku.
 */
export type LastfmGenreSource =
  | "lastfm-top-tags"
  | "lastfm-track-top-tags"
  | "lastfm-artist-info-tags"
  | null;

/** Adaptery zewnętrznych metod wymagane do utworzenia gatewaya. */
export type LastfmTrackGatewayDependencies = {
  /** Wykonuje zapytanie `track.getInfo`. */
  requestTrackInfo: (
    params: LastfmTrackRequestParams
  ) => Promise<LastfmTrackApiResponse>;

  /** Wykonuje zapytanie `track.getTopTags`. */
  requestTrackTopTags: (
    params: LastfmTrackRequestParams
  ) => Promise<LastfmTrackTopTagsApiResponse>;
};

/** Port dostępu do danych jednego utworu Last.fm. */
export type LastfmTrackGateway = {
  /** Pobiera podstawowe dane utworu i osadzone top tagi. */
  lookupTrack(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackApiResponse>;

  /** Pobiera top tagi utworu z osobnej metody Last.fm. */
  lookupTrackTopTags(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackTopTagsApiResponse>;
};

/**
 * Jednoznaczny identyfikator utworu akceptowany przez Last.fm: MBID albo para
 * nazw artysty i utworu.
 */
export type LastfmTrackIdentifier =
  | {
      /** Identyfikator utworu w MusicBrainz. */
      mbid: string;
      /** Niedozwolone w wariancie wykorzystującym MBID. */
      artist?: never;
      /** Niedozwolone w wariancie wykorzystującym MBID. */
      track?: never;
    }
  | {
      /** Niedozwolone w wariancie wykorzystującym nazwy. */
      mbid?: never;
      /** Nazwa artysty wymagana razem z nazwą utworu. */
      artist: string;
      /** Nazwa utworu wymagana razem z nazwą artysty. */
      track: string;
    };

/** Parametry wysyłane do Last.fm po włączeniu automatycznej korekty nazw. */
export type LastfmTrackRequestParams = LastfmTrackIdentifier & {
  /** Wartość `1` włącza poprawianie nazw przez Last.fm. */
  autocorrect: 1;
};

/** Przypadki użycia udostępniane przez serwis utworów Last.fm. */
export type LastfmTrackService = {
  /** Pobiera metadane utworu i klasyfikuje jego gatunki z fallbackami. */
  getTrackInfo(identifier: LastfmTrackIdentifier): Promise<LastfmTrackInfo>;
};
