/**
 * Surowy tag otrzymany z API Last.fm.
 * Pola są opcjonalne, ponieważ zewnętrzna odpowiedź może być niepełna.
 */
export type LastfmTagApiResponse = {
  /** Nazwa tagu, jeśli została zwrócona przez Last.fm. */
  name?: string;
  /** Adres strony tagu w Last.fm, jeśli jest dostępny. */
  url?: string;
  /** Popularność tagu; API może zwrócić liczbę albo jej zapis tekstowy. */
  count?: number | string;
};

/**
 * Sprawdzony tag używany wewnątrz aplikacji.
 */
export type LastfmTag = {
  /** Niepusta, przycięta nazwa tagu. */
  name: string;
  /** Adres strony tagu albo `null`, jeśli Last.fm go nie zwrócił. */
  url: string | null;
};
