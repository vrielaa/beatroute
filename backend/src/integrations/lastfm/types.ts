import type { LastfmTag } from "@application/lastfm/types.js";

/**
 * Surowy tag otrzymany z API Last.fm.
 * Pola są opcjonalne, ponieważ zewnętrzna odpowiedź może być niepełna.
 */
type LastfmTagApiResponse = {
  /** Nazwa tagu, jeśli została zwrócona przez Last.fm. */
  name?: string;
  /** Adres strony tagu w Last.fm, jeśli jest dostępny. */
  url?: string;
  /** Popularność tagu; API może zwrócić liczbę albo jej zapis tekstowy. */
  count?: number | string;
};

export type { LastfmTagApiResponse, LastfmTag };
