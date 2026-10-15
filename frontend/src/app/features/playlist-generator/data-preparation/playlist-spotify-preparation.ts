import { defer, EMPTY, expand, last, map, tap, throwIfEmpty } from 'rxjs';
import type { Observable } from 'rxjs';
import type {
  IncompletePlaylistTrack,
  PlaylistPreparationProgress,
  PlaylistTrack,
  PreparedPlaylistDataset,
  PreparedSpotifyTracksPage,
  PreparedPlaylistPage,
  PlaylistSourceSelection,
  SkippedPlaylistTrack,
} from '../playlist-generator.models';

const SPOTIFY_PAGE_SIZE = 50;
const MAX_SOURCE_POSITIONS = 500;

/**
 * Przygotowuje zbiór ze stron Spotify od offsetu 0, pobieranych pojedynczo.
 * Sposób odczytu biblioteki albo playlisty ustala requestPage, nie ta kolejka.
 * Następny offset odczytuje z odpowiedzi, bez zakładania pełnych stron po 50 pozycji.
 * Kończy przy nextOffset: null; nie uruchamia rankingu ani zapisu playlisty.
 * Zabezpiecza się przed powtórzeniem, cofnięciem lub wyjściem offsetu poza limit 500.
 *
 * Każda subskrypcja rozpoczyna nowy proces z własnymi stronami i licznikami.
 * Samo wywołanie funkcji nie pobiera danych. Po każdej odpowiedzi przekazuje
 * postęp, ale pełny zbiór emituje tylko raz, po zakończeniu wszystkich stron.
 * Puste źródło jest sukcesem. Błąd przerywa proces bez emisji częściowego zbioru
 * i bez automatycznego ponowienia; ponowna subskrypcja zaczyna od offsetu 0.
 * Anulowanie subskrypcji przerywa oczekujące żądanie i nie wysyła kolejnych.
 * Nie gwarantuje zatrzymania pracy już rozpoczętej przez backend.
 *
 * @param requestPage - Pobiera jedną przygotowaną stronę; w aplikacji deleguje do metody API.
 * @param onProgress - Opcjonalny odbiorca liczników po ukończeniu każdej strony.
 * @returns Jeden połączony, zdeduplikowany zbiór albo błąd, bez przechowywania cache.
 */
function prepareSpotifyTracksDataset(
  requestPage: (offset: number) => Observable<PreparedSpotifyTracksPage>,
  onProgress?: (progress: PlaylistPreparationProgress) => void
): Observable<PreparedPlaylistDataset> {
  return defer(() => {
    const completedPages: PreparedSpotifyTracksPage[] = [];

    function preparePage(offset: number): Observable<PreparedSpotifyTracksPage> {
      return defer(() => requestPage(offset)).pipe(
        throwIfEmpty(() => new Error('Nie otrzymano strony utworów Spotify')),
        tap((page) => {
          validateSpotifyPageOffset(page, offset);
          completedPages.push(page);
          const progress = getSpotifyPreparationProgress(completedPages);

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
      map(() => mergePreparedSpotifyPages(completedPages))
    );
  });
}

/**
 * Łączy przygotowane strony źródła Spotify w jeden zbiór, bez pobierania danych i rankingu.
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
function mergePreparedSpotifyPages(pages: PreparedSpotifyTracksPage[]): PreparedPlaylistDataset {
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
function getSpotifyPreparationProgress(
  pages: PreparedSpotifyTracksPage[]
): PlaylistPreparationProgress | null {
  const lastPage = pages.at(-1);

  if (!lastPage) {
    return null;
  }

  const prepared = mergePreparedSpotifyPages(pages);
  const totalTracks = Math.min(lastPage.pagination.totalItems, MAX_SOURCE_POSITIONS);
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
    totalBatches: pages.length + Math.ceil(remainingPositions / SPOTIFY_PAGE_SIZE),
  };
}

/** Sprawdza zgodność offsetu strony i bezpieczny postęp kolejnych żądań, bez walidacji utworów. */
function validateSpotifyPageOffset(page: PreparedSpotifyTracksPage, requestedOffset: number): void {
  const { offset, processedItems, totalItems, nextOffset } = page.pagination;
  const hasInvalidCounters =
    !Number.isSafeInteger(totalItems) ||
    totalItems < 0 ||
    !Number.isSafeInteger(processedItems) ||
    processedItems < 0 ||
    processedItems > SPOTIFY_PAGE_SIZE ||
    requestedOffset + processedItems > Math.min(totalItems, MAX_SOURCE_POSITIONS);
  const hasInvalidNextOffset =
    nextOffset !== null &&
    (!Number.isSafeInteger(nextOffset) ||
      nextOffset <= requestedOffset ||
      nextOffset >= 500 ||
      nextOffset !== requestedOffset + processedItems);
  const hasPrematureEnd =
    nextOffset === null && requestedOffset + processedItems < Math.min(totalItems, 500);

  if (offset !== requestedOffset || hasInvalidCounters || hasInvalidNextOffset || hasPrematureEnd) {
    throw new Error('Niepoprawna kolejność stron utworów Spotify');
  }
}

/**
 * Przygotowuje playlistę przez wspólną kolejkę stron Spotify, zachowując jej pierwszą wersję.
 * Przed każdym kolejnym żądaniem przekazuje tę wersję, a odpowiedzi sprawdza również lokalnie.
 * Każda subskrypcja zaczyna od offsetu 0 i snapshotId: null. Błąd albo anulowanie
 * nie emituje częściowego zbioru; ponowienie nie kontynuuje niestabilnych stron źródła.
 *
 * @param playlistId - Sprawdzone ID źródłowej playlisty.
 * @param requestPage - Jedno żądanie przygotowanej strony, bez automatycznych ponowień.
 * @param onProgress - Opcjonalny odbiorca liczników ukończonych stron.
 * @param onPlaylist - Opcjonalny odbiorca metadanych odczytanej playlisty.
 * @returns Jeden połączony zbiór po zakończeniu wszystkich stron, bez rankingu i zapisu.
 */
function preparePlaylistDataset(
  playlistId: string,
  requestPage: (selection: PlaylistSourceSelection) => Observable<PreparedPlaylistPage>,
  onProgress?: (progress: PlaylistPreparationProgress) => void,
  onPlaylist?: (playlist: PreparedPlaylistPage['playlist']) => void
): Observable<PreparedPlaylistDataset> {
  return defer(() => {
    let snapshotId: string | null = null;
    let totalItems: number | null = null;
    return prepareSpotifyTracksDataset(
      (offset) =>
        requestPage({ playlistId, offset, snapshotId }).pipe(
          tap((page) => {
            const playlist = page.playlist;
            if (
              !playlist ||
              playlist.id !== playlistId ||
              typeof playlist.name !== 'string' ||
              typeof playlist.snapshotId !== 'string' ||
              !playlist.snapshotId.trim() ||
              (snapshotId !== null && playlist.snapshotId !== snapshotId) ||
              (totalItems !== null && page.pagination.totalItems !== totalItems)
            ) {
              throw new Error('Niepoprawna wersja źródłowej playlisty');
            }
            snapshotId = playlist.snapshotId;
            totalItems = page.pagination.totalItems;
            onPlaylist?.(playlist);
          })
        ),
      onProgress
    );
  });
}

export {
  prepareSpotifyTracksDataset,
  preparePlaylistDataset,
  mergePreparedSpotifyPages,
  getSpotifyPreparationProgress,
};
