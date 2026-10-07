import type { LastfmTag, LastfmTagApiResponse } from "../types.js";

/**
 * Fragment surowej odpowiedzi `artist.getInfo` używany przez aplikację.
 * Pola są opcjonalne, ponieważ Last.fm może zwrócić niepełne dane artysty.
 */
type LastfmArtistApiResponse = {
  /** Dane artysty; pole może być nieobecne w niepełnej odpowiedzi API. */
  artist?: {
    /** Nazwa artysty zwrócona przez Last.fm. */
    name?: string;
    /** Identyfikator artysty w MusicBrainz. */
    mbid?: string;
    /** Adres strony artysty w Last.fm. */
    url?: string;
    /** Kontener tagów przypisanych artyście. */
    tags?: {
      /** Pojedynczy tag albo tablica tagów z zewnętrznego API. */
      tag?: LastfmTagApiResponse | LastfmTagApiResponse[];
    };
  };
};

/** Dane artysty po przekształceniu odpowiedzi Last.fm do modelu aplikacji. */
type LastfmArtistInfo = {
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
 * Wynik pobrania informacji o jednym artyście z Last.fm. Status pozwala
 * obsłużyć częściową awarię bez przerywania pobierania pozostałych artystów.
 *
 * @property status - Informuje, czy pobranie danych zakończyło się powodzeniem.
 * @property requestedName - Nazwa artysty wysłana do Last.fm.
 * @property response - Surowa odpowiedź dostępna dla wyniku `fulfilled`.
 * @property error - Oryginalny błąd dostępny dla wyniku `rejected`.
 */
type LastfmArtistInfoResult =
  | {
      status: "fulfilled";
      requestedName: string;
      response: LastfmArtistApiResponse;
    }
  | {
      status: "rejected";
      requestedName: string;
      error: unknown;
    };

/**
 * Port dostępu do danych artystów Last.fm używany przez warstwę serwisową.
 * Dzięki temu serwis można testować bez wykonywania prawdziwych zapytań HTTP.
 *
 * @property getArtistInfo - Pobiera surowe dane jednego artysty.
 * @property getManyArtistInfoResults - Pobiera dane wielu artystów i zachowuje błędy jako wyniki.
 */
type LastfmArtistGateway = {
  getArtistInfo: (artistName: string) => Promise<LastfmArtistApiResponse>;
  getManyArtistInfoResults: (
    artistNames: string[]
  ) => Promise<LastfmArtistInfoResult[]>;
};

/** Minimalny interfejs loggera wymagany przez gateway. */
type ErrorLogger = {
  /** Zapisuje komunikat błędu oraz opcjonalne dane diagnostyczne. */
  error: (...values: unknown[]) => void;
};

export type {
  LastfmArtistApiResponse,
  LastfmArtistInfo,
  LastfmArtistInfoResult,
  LastfmArtistGateway,
  ErrorLogger,
};
