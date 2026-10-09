import type {
  PlaylistPreferences,
  PlaylistTrack,
  PlaylistTrackEvaluation,
} from "@domain/playlist-generator/types.js";

import { evaluatePlaylistTrack } from "./evaluate-track.js";

/**
 * Ocenia utwory według preferencji i porządkuje je malejąco według dopasowania.
 * Wyniki null umieszcza za ocenami liczbowymi, również za zerem. Przy równych
 * ocenach oraz między wynikami null zachowuje kolejność źródłową.
 * Bez aktywnych preferencji wszystkie oceny wynoszą null, więc kolejność się nie zmienia.
 * Nie filtruje utworów ani nie nakłada kary za brakujące pomiary. Zachowuje
 * wyjaśnienia ocen i referencje do utworów, ale nie modyfikuje wejściowej tablicy.
 *
 * @param tracks - Zwalidowane utwory dopuszczone przez filtrowanie wymagań.
 * @param preferences - Zwalidowane preferencje; null wyłącza daną cechę.
 * @returns Nowa tablica ocen wszystkich przekazanych utworów w kolejności rankingu.
 */
function rankPlaylistTracks(
  tracks: PlaylistTrack[],
  preferences: PlaylistPreferences
): PlaylistTrackEvaluation[] {
  const evaluatedTracks = tracks.map((track) =>
    evaluatePlaylistTrack(track, preferences)
  );

  evaluatedTracks.sort((a, b) => {
    if (a.overallMatch === null && b.overallMatch === null) {
      return 0;
    }
    if (a.overallMatch === null) {
      return 1;
    }
    if (b.overallMatch === null) {
      return -1;
    }
    return b.overallMatch - a.overallMatch;
  });

  return evaluatedTracks;
}

export { rankPlaylistTracks };
