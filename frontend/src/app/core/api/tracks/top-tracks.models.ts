import type { TopTrack } from '@core/api/spotify/spotify.models';
import type { AudioFeatures } from './audio-features.models';

/** Wymagana kompletność danych: dowolny użyteczny pomiar lub pełny wektor mapy. */
type TopTracksPurpose = 'statistics' | 'music-map';

/**
 * Odpowiedź przygotowania jednej partii top utworów.
 * @property tracks - Przydatne metadane w kolejności Spotify.
 * @property audioFeatures - Pomiary tych samych utworów.
 * @property processedItems - Sprawdzone pozycje, także pominięte.
 * @property skippedItems - Pozycje pominięte w tej partii.
 * @property totalItems - Liczba pozycji dostępnych dla okresu.
 * @property nextOffset - Następna pozycja źródłowa lub null na końcu.
 */
type TopTracksBatch = {
  tracks: TopTrack[];
  audioFeatures: AudioFeatures[];
  processedItems: number;
  skippedItems: number;
  totalItems: number;
  nextOffset: number | null;
};

/**
 * Rzeczywisty postęp dobierania, aktualizowany po odpowiedzi partii.
 * @property requestedTracks - Docelowa liczba przydatnych utworów.
 * @property foundTracks - Liczba znalezionych, unikalnych utworów.
 * @property skippedItems - Łączna liczba pominiętych pozycji, także powtórzeń między stronami.
 * @property processedItems - Łączna liczba sprawdzonych pozycji źródłowych.
 * @property totalItems - Dostępna liczba pozycji; null przed pierwszą odpowiedzią.
 * @property complete - Osiągnięto cel albo koniec źródła; nigdy nie oznacza awarii.
 */
type TopTracksProgress = {
  requestedTracks: number;
  foundTracks: number;
  skippedItems: number;
  processedItems: number;
  totalItems: number | null;
  complete: boolean;
};

/**
 * Bieżący zbiór należący do pojedynczej subskrypcji, nie do globalnego cache.
 * @property tracks - Znalezione unikalne utwory w kolejności źródła.
 * @property audioFeatures - Zachowane pomiary, bez ponownego pobierania.
 * @property progress - Postęp tej operacji.
 * @property nextOffset - Pozycja dla następnej partii lub null po zakończeniu.
 */
type TopTracksCollection = {
  tracks: TopTrack[];
  audioFeatures: AudioFeatures[];
  progress: TopTracksProgress;
  nextOffset: number | null;
};

export type { TopTracksPurpose, TopTracksBatch, TopTracksProgress, TopTracksCollection };
