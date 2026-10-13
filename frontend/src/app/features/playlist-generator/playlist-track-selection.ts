import type { GeneratedPlaylist } from './playlist-generator.models';

/**
 * Sprawdza liczbę utworów wybieranych w trybie „Top N”.
 * Nie przycina wartości do dostępnej liczby utworów ani nie zaokrągla ułamków.
 * Pusty ranking nie pozwala na wybór, także z limitem zero.
 *
 * @param trackCount - Wpisana liczba utworów albo null dla pustego pola.
 * @param availableTracksCount - Liczba dopuszczonych utworów w rankingu.
 * @returns Komunikat błędu albo null, gdy limit jest całkowity i mieści się w zakresie.
 */
function validateTopTrackCount(
  trackCount: number | null,
  availableTracksCount: number
): string | null {
  if (availableTracksCount === 0) {
    return 'Nie ma dopuszczonych utworów do wyboru.';
  }

  if (trackCount === null) {
    return 'Podaj liczbę utworów.';
  }

  if (!Number.isInteger(trackCount) || trackCount < 1 || trackCount > availableTracksCount) {
    return `Liczba utworów musi być liczbą całkowitą od 1 do ${availableTracksCount}.`;
  }

  return null;
}

/**
 * Wybiera identyfikatory pierwszych N dopuszczonych utworów z wyniku generatora.
 * Zachowuje otrzymaną kolejność, oceny i powody odrzucenia; nie modyfikuje wyniku.
 * Nie usuwa dopuszczonych utworów z oceną zero ani bez oceny. Nie sięga do rejectedTracks.
 * Korzysta z gotowego wyniku generatora, którego identyfikatory są już unikalne.
 *
 * @param result - Wynik generatora z pełnym rankingiem i odrzuconymi utworami.
 * @param trackCount - Liczba pierwszych pozycji do wyboru, od 1 do długości rankingu.
 * @returns Nowa tablica identyfikatorów w kolejności rankingu.
 * @throws Error, gdy limit jest niepoprawny albo ranking jest pusty.
 */
function selectTopTrackIds(result: GeneratedPlaylist, trackCount: number): string[] {
  const validationError = validateTopTrackCount(trackCount, result.rankedTracks.length);

  if (validationError !== null) {
    throw new Error(validationError);
  }

  return result.rankedTracks.slice(0, trackCount).map((evaluation) => evaluation.track.id);
}

/**
 * Wybiera identyfikatory z gotowego rankingu i zachowuje kolejność jego pozycji.
 * Pomija nieznane i odrzucone utwory oraz powtórzenia w wyborze; nie zmienia wyniku.
 * Pusty wybór jest dozwolony podczas edycji, ale nie wystarczy do zapisu playlisty.
 *
 * @param result - Wynik generatora z unikalnymi identyfikatorami dopuszczonych utworów.
 * @param selectedTrackIds - Identyfikatory zaznaczonych utworów, w dowolnej kolejności.
 * @returns Nowa tablica wybranych ID w kolejności rankingu, bez ID spoza rankedTracks.
 */
function selectRankedTrackIds(
  result: GeneratedPlaylist,
  selectedTrackIds: readonly string[]
): string[] {
  const selectedIds = new Set(selectedTrackIds);

  return result.rankedTracks
    .filter((evaluation) => selectedIds.has(evaluation.track.id))
    .map((evaluation) => evaluation.track.id);
}

export { validateTopTrackCount, selectTopTrackIds, selectRankedTrackIds };
