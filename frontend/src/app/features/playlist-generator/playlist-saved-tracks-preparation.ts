import { defer, EMPTY, expand, last, map, tap, throwIfEmpty } from 'rxjs';
import type { Observable } from 'rxjs';
import type {
  IncompletePlaylistTrack,
  PlaylistPreparationProgress,
  PlaylistTrack,
  PreparedPlaylistDataset,
  PreparedSavedTracksPage,
  SkippedPlaylistTrack,
} from './playlist-generator.models';

const SAVED_TRACKS_PAGE_SIZE = 50;
const MAX_SAVED_TRACKS_POSITIONS = 500;

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

/**
 * Łączy przygotowane strony biblioteki w jeden zbiór, bez pobierania danych i rankingu.
 * Zachowuje pierwszy przygotowany utwór o danym ID oraz jego informacje o brakach.
 * Nie zastępuje go późniejszym odczytem ani nie miesza pomiarów różnych wystąpień.
 * Wielkość liter w ID ma znaczenie. Powtórzone pominięcia zachowuje tylko raz,
 * z pierwszym powodem; usuwa je, jeśli utwór udało się przygotować na dowolnej stronie.
 *
 * Tworzy nowe tablice bez zmiany wejścia; zawarte w nich obiekty nie są kopiowane.
 * Pozycje opisane przez unavailableItemsCount pozostają wyłącznie w licznikach stron;
 * odpowiedź nie zawiera ich ID.
 *
 * @param pages - Ukończone strony jednego przygotowania, w kolejności odczytu od offsetu 0.
 * @returns Unikalne utwory w kolejności pierwszego przygotowania, pominięcia i braki.
 * Bez stron zwraca nowy, pusty zbiór wersji 1.
 */
function mergeSavedTracksPages(pages: PreparedSavedTracksPage[]): PreparedPlaylistDataset {
  const tracksById = new Map<string, PlaylistTrack>();
  const skippedTracksById = new Map<string, SkippedPlaylistTrack>();
  const incompleteTracksById = new Map<string, IncompletePlaylistTrack>();

  for (const page of pages) {
    const prepared = page.preparedDataset;
    const pageIncompleteTracksById = new Map(
      prepared.incompleteTracks.map((track) => [track.spotifyId, track])
    );

    for (const track of prepared.dataset.tracks) {
      if (tracksById.has(track.id)) {
        continue;
      }

      tracksById.set(track.id, track);
      const incompleteTrack = pageIncompleteTracksById.get(track.id);

      if (incompleteTrack) {
        incompleteTracksById.set(track.id, incompleteTrack);
      }
    }

    for (const skippedTrack of prepared.skippedTracks) {
      if (!skippedTracksById.has(skippedTrack.spotifyId)) {
        skippedTracksById.set(skippedTrack.spotifyId, skippedTrack);
      }
    }
  }

  return {
    dataset: { version: 1, tracks: Array.from(tracksById.values()) },
    skippedTracks: Array.from(skippedTracksById.values()).filter(
      (track) => !tracksById.has(track.spotifyId)
    ),
    incompleteTracks: Array.from(incompleteTracksById.values()),
  };
}

/**
 * Wylicza postęp z odpowiedzi ukończonych, kolejnych stron biblioteki od offsetu 0.
 * Nie liczy oczekującego żądania i nie wykonuje zapytań. Suma processedItems obejmuje
 * również niedostępne pozycje i duplikaty; przygotowane utwory liczy po deduplikacji.
 * Pominięcia to unikalne, nadal nieprzygotowane ID oraz suma unavailableItemsCount.
 * Pozycji z tego licznika nie można deduplikować, bo odpowiedź nie zawiera ich ID.
 *
 * Docelową liczbę pozycji bierze z ostatniej odpowiedzi i ogranicza do 500.
 * Licznik przetworzonych nie przekracza tego celu. Liczba pozostałych partii
 * zakłada strony po 50 pozycji i jest przeliczana po każdej odpowiedzi;
 * nextOffset: null oznacza brak kolejnych partii. Pusta biblioteka daje jedną
 * ukończoną partię i zero pozycji, nie błąd.
 *
 * @param pages - Kolejne odpowiedzi jednego przygotowania w granicach pierwszych 500 pozycji.
 * @returns Liczniki zgodne ze wspólnym modelem postępu albo null przed pierwszą odpowiedzią,
 * gdy rozmiar biblioteki jest jeszcze nieznany. Nie oznacza to pustej biblioteki.
 */
function getSavedTracksPreparationProgress(
  pages: PreparedSavedTracksPage[]
): PlaylistPreparationProgress | null {
  const lastPage = pages.at(-1);

  if (!lastPage) {
    return null;
  }

  const prepared = mergeSavedTracksPages(pages);
  const totalTracks = Math.min(lastPage.pagination.totalItems, MAX_SAVED_TRACKS_POSITIONS);
  const processedItems = pages.reduce((sum, page) => sum + page.pagination.processedItems, 0);
  const processedTracks = Math.min(processedItems, totalTracks);
  const unavailableItemsCount = pages.reduce((sum, page) => sum + page.unavailableItemsCount, 0);
  const remainingPositions =
    lastPage.pagination.nextOffset === null ? 0 : totalTracks - processedTracks;

  return {
    processedTracks,
    totalTracks,
    preparedTracks: prepared.dataset.tracks.length,
    skippedTracks: prepared.skippedTracks.length + unavailableItemsCount,
    completedBatches: pages.length,
    totalBatches: pages.length + Math.ceil(remainingPositions / SAVED_TRACKS_PAGE_SIZE),
  };
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

export { prepareSavedTracksDataset, mergeSavedTracksPages, getSavedTracksPreparationProgress };
