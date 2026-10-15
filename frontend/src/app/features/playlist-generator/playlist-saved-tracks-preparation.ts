import { defer, EMPTY, expand, last, map, tap, throwIfEmpty } from 'rxjs';
import type { Observable } from 'rxjs';
import {
  getSavedTracksPreparationProgress,
  mergeSavedTracksPages,
} from './playlist-saved-tracks-pages';
import type {
  PlaylistPreparationProgress,
  PreparedPlaylistDataset,
  PreparedSavedTracksPage,
} from './playlist-generator.models';

/**
 * Przygotowuje bibliotekę od offsetu 0, pobierając kolejne strony pojedynczo.
 * Następny offset odczytuje z odpowiedzi, bez zakładania pełnych stron po 50 pozycji.
 * Kończy przy nextOffset: null; nie uruchamia rankingu ani zapisu playlisty.
 * Zabezpiecza się przed powtórzeniem, cofnięciem lub wyjściem offsetu poza limit 500.
 *
 * Każda subskrypcja rozpoczyna nowy proces z własnymi stronami i licznikami.
 * Samo wywołanie funkcji nie pobiera danych. Po każdej odpowiedzi przekazuje
 * postęp, ale pełny zbiór emituje tylko raz, po zakończeniu wszystkich stron.
 * Pusta biblioteka jest sukcesem. Błąd przerywa proces bez emisji częściowego zbioru
 * i bez automatycznego ponowienia; ponowna subskrypcja zaczyna od offsetu 0.
 * Anulowanie subskrypcji przerywa oczekujące żądanie i nie wysyła kolejnych.
 * Nie gwarantuje zatrzymania pracy już rozpoczętej przez backend.
 *
 * @param requestPage - Pobiera jedną przygotowaną stronę; w aplikacji deleguje do metody API.
 * @param onProgress - Opcjonalny odbiorca liczników po ukończeniu każdej strony.
 * @returns Jeden połączony, zdeduplikowany zbiór albo błąd, bez przechowywania cache.
 */
function prepareSavedTracksDataset(
  requestPage: (offset: number) => Observable<PreparedSavedTracksPage>,
  onProgress?: (progress: PlaylistPreparationProgress) => void
): Observable<PreparedPlaylistDataset> {
  return defer(() => {
    const completedPages: PreparedSavedTracksPage[] = [];

    function preparePage(offset: number): Observable<PreparedSavedTracksPage> {
      return defer(() => requestPage(offset)).pipe(
        throwIfEmpty(() => new Error('Nie otrzymano strony zapisanych utworów')),
        tap((page) => {
          validateSavedTracksPageOffset(page, offset);
          completedPages.push(page);
          const progress = getSavedTracksPreparationProgress(completedPages);

          if (progress) {
            onProgress?.(progress);
          }
        })
      );
    }

    return preparePage(0).pipe(
      expand((page) => {
        const nextOffset = page.pagination.nextOffset;
        return nextOffset === null ? EMPTY : preparePage(nextOffset);
      }, 1),
      last(),
      map(() => mergeSavedTracksPages(completedPages))
    );
  });
}

/** Sprawdza zgodność offsetu strony i bezpieczny postęp kolejnych żądań, bez walidacji utworów. */
function validateSavedTracksPageOffset(
  page: PreparedSavedTracksPage,
  requestedOffset: number
): void {
  const { offset, processedItems, totalItems, nextOffset } = page.pagination;
  const hasInvalidNextOffset =
    nextOffset !== null &&
    (!Number.isSafeInteger(nextOffset) ||
      nextOffset <= requestedOffset ||
      nextOffset >= 500 ||
      nextOffset !== requestedOffset + processedItems);
  const hasPrematureEnd =
    nextOffset === null && requestedOffset + processedItems < Math.min(totalItems, 500);

  if (offset !== requestedOffset || hasInvalidNextOffset || hasPrematureEnd) {
    throw new Error('Niepoprawna kolejność stron zapisanych utworów');
  }
}

export { prepareSavedTracksDataset };
