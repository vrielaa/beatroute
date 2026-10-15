import type {
  PlaylistPreparationProgress,
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
} from '../playlist-generator.models';

const PREPARATION_BATCH_SIZE = 20;

/**
 * Dzieli sprawdzony plik na partie po najwyżej 20 ID, zachowując ich kolejność.
 * Nie zmienia pliku i nie wykonuje zapytań; każda partia ma format istniejącego endpointu.
 *
 * @param file - Bieżący plik po przycięciu i usunięciu duplikatów przez parser.
 * @returns Partie do wysłania kolejno; ostatnia może zawierać mniej niż 20 ID.
 */
function splitPlaylistTrackIds(file: PlaylistTrackIdsFile): PlaylistTrackIdsFile[] {
  const batches: PlaylistTrackIdsFile[] = [];

  for (let offset = 0; offset < file.spotifyTrackIds.length; offset += PREPARATION_BATCH_SIZE) {
    batches.push({
      version: 1,
      spotifyTrackIds: file.spotifyTrackIds.slice(offset, offset + PREPARATION_BATCH_SIZE),
    });
  }

  return batches;
}

/**
 * Łączy przygotowane dane kolejnych partii, bez filtrowania i rankingu.
 * Zachowuje kolejność utworów, pominięć i informacji o niepełnych pomiarach.
 * Tworzy nowe tablice, nie zmieniając żadnej odpowiedzi backendu.
 *
 * @param previous - Dane z wcześniej ukończonych partii, także pusty zbiór początkowy.
 * @param next - Odpowiedź następnej partii, także bez znalezionych utworów.
 * @returns Połączone dane do jednej analizy całego zbioru.
 */
function mergePreparedPlaylistDatasets(
  previous: PreparedPlaylistDataset,
  next: PreparedPlaylistDataset
): PreparedPlaylistDataset {
  return {
    dataset: {
      version: 1,
      tracks: [...previous.dataset.tracks, ...next.dataset.tracks],
    },
    skippedTracks: [...previous.skippedTracks, ...next.skippedTracks],
    incompleteTracks: [...previous.incompleteTracks, ...next.incompleteTracks],
  };
}

/**
 * Wylicza liczniki z odpowiedzi zakończonych partii bieżącego pliku.
 * Ostatnia partia może mieć mniej niż 20 ID. Pusty wynik partii nadal oznacza,
 * że jej ID zostały przetworzone. Częściowe braki nie zmniejszają tego licznika.
 *
 * @param file - Sprawdzony plik, do którego należą zakończone partie.
 * @param completedBatches - Odpowiedzi kolejnych partii, bez błędnych i oczekujących żądań.
 * @returns Postęp przygotowania danych, niezależny od późniejszego rankingu.
 */
function getPlaylistPreparationProgress(
  file: PlaylistTrackIdsFile,
  completedBatches: PreparedPlaylistDataset[]
): PlaylistPreparationProgress {
  return {
    processedTracks: Math.min(
      completedBatches.length * PREPARATION_BATCH_SIZE,
      file.spotifyTrackIds.length
    ),
    totalTracks: file.spotifyTrackIds.length,
    preparedTracks: completedBatches.reduce((sum, batch) => sum + batch.dataset.tracks.length, 0),
    skippedTracks: completedBatches.reduce((sum, batch) => sum + batch.skippedTracks.length, 0),
    completedBatches: completedBatches.length,
    totalBatches: Math.ceil(file.spotifyTrackIds.length / PREPARATION_BATCH_SIZE),
  };
}

export { splitPlaylistTrackIds, mergePreparedPlaylistDatasets, getPlaylistPreparationProgress };
