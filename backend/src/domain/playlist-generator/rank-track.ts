import type {
  PlaylistFeatureMatch,
  PlaylistPreferences,
  PlaylistTrack,
  PlaylistTrackEvaluation,
} from "@domain/playlist-generator/types.js";

import { evaluatePlaylistTrack } from "./evaluate-track.js";
import { calculatePreferenceCloseness } from "./preference-match.js";

/**
 * Ocenia utwory według preferencji i porządkuje je malejąco według dopasowania.
 * Wyniki null umieszcza za ocenami liczbowymi, również za zerem. Przy dokładnie
 * równych ocenach liczbowych porównuje średnią bliskość dostępnych pomiarów
 * do wybranych poziomów. Gdy ta średnia też jest równa albo obie oceny są null,
 * zachowuje kolejność źródłową. Nie rozstrzyga remisów na podstawie procentów
 * zaokrąglonych przez interfejs.
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

  evaluatedTracks.sort((first, second) => {
    if (first.overallMatch === null && second.overallMatch === null) {
      return 0;
    }
    if (first.overallMatch === null) {
      return 1;
    }
    if (second.overallMatch === null) {
      return -1;
    }

    const matchDifference = second.overallMatch - first.overallMatch;

    if (matchDifference !== 0) {
      return matchDifference;
    }

    return (
      calculateTieBreakerScore(second.featureMatches) -
      calculateTieBreakerScore(first.featureMatches)
    );
  });

  return evaluatedTracks;
}

/**
 * Wyznacza średnią bliskość pomiarów do wybranych poziomów na potrzeby remisu.
 * Uwzględnia wyłącznie aktywne preferencje z dostępnym pomiarem, o równych wagach.
 * Pomiar zero jest uwzględniany, a null pomijany bez kary za brak danych.
 *
 * @param featureMatches - Oceny aktywnych preferencji utworu.
 * @returns Średnia bliskość w skali 0–1 lub zero, gdy nie ma pomiarów.
 * Wyniki bez pomiarów trafiają na koniec rankingu bez użycia tej oceny.
 */
function calculateTieBreakerScore(
  featureMatches: PlaylistFeatureMatch[]
): number {
  let totalCloseness = 0;
  let measuredFeaturesCount = 0;

  for (const { measurement, level } of featureMatches) {
    if (measurement === null) {
      continue;
    }

    totalCloseness += calculatePreferenceCloseness(measurement, level);
    measuredFeaturesCount += 1;
  }

  return measuredFeaturesCount === 0
    ? 0
    : totalCloseness / measuredFeaturesCount;
}

export { rankPlaylistTracks };
