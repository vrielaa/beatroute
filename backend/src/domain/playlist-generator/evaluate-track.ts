import { calculatePreferenceMatch } from "./preference-match.js";
import type {
  PlaylistFeatureMatch,
  PlaylistPreferenceFeature,
  PlaylistPreferences,
  PlaylistTrack,
  PlaylistTrackEvaluation,
} from "@domain/playlist-generator/types.js";

/** Kolejność cech w wyjaśnieniu oceny; nie określa ich wag ani ważności. */
const PREFERENCE_FEATURES: PlaylistPreferenceFeature[] = [
  "energy",
  "danceability",
  "valence",
  "acousticness",
  "instrumentalness",
];

/**
 * Ocenia jeden utwór względem wcześniej zwalidowanych preferencji.
 * Pomija wyłączone preferencje, a dla każdej aktywnej zapisuje pomiar i jego
 * rozmyte dopasowanie. Brak pomiaru pozostawia jako null, bez zastępowania zerem.
 * Wynik łączny jest niezaokrągloną średnią dostępnych dopasowań o równych wagach;
 * zero jest pełnoprawną oceną uwzględnianą w tej średniej.
 * Gdy nie można ocenić żadnej cechy, wynik łączny wynosi null. Pusta lista ocen
 * oznacza brak aktywnych preferencji, a wpisy z null wskazują brakujące pomiary.
 * Nie modyfikuje wejścia, nie filtruje ani nie sortuje utworów i nie wywołuje API.
 *
 * @param track - Zwalidowany utwór z metadanymi i pomiarami cech audio.
 * @param preferences - Poziomy pięciu preferencji; null wyłącza daną preferencję.
 * @returns Utwór źródłowy, średnie dopasowanie i wyjaśnienie każdej aktywnej preferencji.
 */
function evaluatePlaylistTrack(
  track: PlaylistTrack,
  preferences: PlaylistPreferences
): PlaylistTrackEvaluation {
  const featureMatches: PlaylistFeatureMatch[] = [];
  let totalMatch = 0;
  let evaluatedFeaturesCount = 0;

  for (const feature of PREFERENCE_FEATURES) {
    const level = preferences[feature];

    if (level === null) {
      continue;
    }

    const measurement = track.audioFeatures[feature];

    const match =
      measurement === null
        ? null
        : calculatePreferenceMatch(measurement, level);

    featureMatches.push({
      feature,
      level,
      measurement,
      match,
    });

    if (match !== null) {
      totalMatch += match;
      evaluatedFeaturesCount += 1;
    }
  }

  const overallMatch =
    evaluatedFeaturesCount === 0 ? null : totalMatch / evaluatedFeaturesCount;

  return {
    track,
    overallMatch,
    featureMatches,
  };
}

export { evaluatePlaylistTrack };
