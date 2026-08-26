/** Tag przypisany artyście w odpowiedzi Last.fm. */
export type LastfmTag = {
  /** Wyświetlana nazwa tagu. */
  name: string;
  /** Adres strony tagu w Last.fm, jeśli został zwrócony przez API. */
  url?: string;
};

/**
 * Fragment surowej odpowiedzi `artist.getInfo` używany przez aplikację.
 * Pola są opcjonalne, ponieważ Last.fm może zwrócić niepełne dane artysty.
 */
export type LastfmArtistApiResponse = {
  artist?: {
    name?: string;
    mbid?: string;
    url?: string;
    tags?: {
      tag?: LastfmTag[];
    };
  };
};

/** Dane artysty po przekształceniu odpowiedzi Last.fm do modelu aplikacji. */
export type LastfmArtistInfo = {
  /** Nazwa zwrócona przez Last.fm lub nazwa podana w zapytaniu. */
  name: string;
  /** Oryginalna nazwa użyta do wyszukania artysty. */
  requestedName: string;
  /** Identyfikator MusicBrainz, jeśli jest dostępny. */
  mbid: string | null;
  /** Adres strony artysty w Last.fm, jeśli jest dostępny. */
  url: string | null;
  /** Pierwszy tag rozpoznany jako gatunek muzyczny. */
  genre: string | null;
  /** Wszystkie tagi, które mogą zostać sklasyfikowane jako gatunki. */
  genreCandidates: string[];
  /** Wszystkie znormalizowane tagi zwrócone przez Last.fm. */
  tags: LastfmTag[];
};

/**
 * Wynik pojedynczego zapytania wykonywanego w ramach wyszukiwania wielu
 * artystów. Status pozwala obsłużyć częściową awarię bez przerywania całej
 * operacji.
 */
export type LastfmArtistLookup =
  | {
      /** Zapytanie zakończyło się powodzeniem. */
      status: "fulfilled";
      /** Nazwa, której dotyczyło zapytanie. */
      requestedName: string;
      /** Surowa odpowiedź Last.fm. */
      response: LastfmArtistApiResponse;
    }
  | {
      /** Zapytanie zakończyło się błędem. */
      status: "rejected";
      /** Nazwa, której dotyczyło zapytanie. */
      requestedName: string;
      /** Oryginalny błąd klienta Last.fm. */
      error: unknown;
    };

/**
 * Port dostępu do danych artystów Last.fm używany przez warstwę serwisową.
 * Dzięki temu serwis można testować bez wykonywania prawdziwych zapytań HTTP.
 */
export type LastfmArtistGateway = {
  /** Pobiera surowe dane jednego artysty i przekazuje błąd wywołującemu. */
  lookupArtist: (artistName: string) => Promise<LastfmArtistApiResponse>;
  /** Pobiera wielu artystów, zachowując powodzenia i błędy jako wyniki. */
  lookupMany: (artistNames: string[]) => Promise<LastfmArtistLookup[]>;
};

/** Minimalny interfejs loggera wymagany przez gateway. */
export type ErrorLogger = {
  /** Zapisuje komunikat błędu oraz opcjonalne dane diagnostyczne. */
  error: (...values: unknown[]) => void;
};
