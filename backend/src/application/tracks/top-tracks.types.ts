import type { TrackAudioFeatures } from "@domain/tracks/types.js";
import type {
  SpotifyTopItemsSelection,
  SpotifyTrackApiResponse,
} from "@integrations/spotify/spotify.types.js";

/** Zastosowanie zbioru: dowolny pomiar do statystyk lub pełny wektor do mapy. */
type TopTracksPurpose = "statistics" | "music-map";

/**
 * Wybór jednej partii top utworów.
 * @property purpose - Wymagana kompletność pomiarów.
 * @property offset - Liczba przeczytanych pozycji źródłowych, nie znalezionych utworów.
 */
type TopTracksBatchSelection = SpotifyTopItemsSelection & {
  purpose: TopTracksPurpose;
};

/**
 * Przygotowana pojedyncza strona, bez automatycznego dobierania kolejnych.
 * @property tracks - Przydatne, unikalne w tej partii utwory w kolejności Spotify.
 * @property audioFeatures - Pomiary przypisane wyłącznie do zwróconych utworów.
 * @property processedItems - Liczba sprawdzonych pozycji Spotify, także pominiętych.
 * @property skippedItems - Pozycje bez przydatnych metadanych lub pomiarów i duplikaty.
 * @property totalItems - Liczba dostępnych pozycji według Spotify.
 * @property nextOffset - Następna pozycja źródłowa albo null na końcu zbioru.
 */
type TopTracksBatch = {
  tracks: SpotifyTrackApiResponse[];
  audioFeatures: TrackAudioFeatures[];
  processedItems: number;
  skippedItems: number;
  totalItems: number;
  nextOffset: number | null;
};

/** Odczyt jednej partii z jawnym przeznaczeniem pomiarów. */
type TopTracksBatchReader = {
  getTopTracksBatch(
    accessToken: string,
    selection: TopTracksBatchSelection
  ): Promise<TopTracksBatch>;
};

export type {
  TopTracksPurpose,
  TopTracksBatchSelection,
  TopTracksBatch,
  TopTracksBatchReader,
};
