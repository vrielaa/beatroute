import type {
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
  PlaylistPreferences,
} from "@domain/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";

/**
 * Sprawdza pięć preferencji generatora i zwraca ich znormalizowaną kopię.
 * Każde pole musi być obecne i mieć wartość low, medium, high albo null.
 * Null wyłącza preferencję; brak pola lub undefined nie oznacza jej wyłączenia.
 * Nie zmienia wielkości liter ani nie przycina wartości. Pomija dodatkowe pola,
 * nie modyfikuje wejścia i nie sprawdza pomiarów ani dopasowania utworów.
 *
 * @param value - Ustawienia użytkownika przed sprawdzeniem struktury i wartości.
 * @returns Sprawdzone preferencje, bez dodatkowych pól wejściowych.
 * @throws RequestValidationError Gdy wejście nie jest obiektem, brakuje pola
 * lub jego wartość nie jest dozwolonym poziomem ani null.
 */
function parsePlaylistGeneratorPreferences(
  value: unknown
): PlaylistPreferences {
  const preferences = requireRecord(value);

  return {
    energy: validatePreferenceLevel(preferences, "energy"),
    danceability: validatePreferenceLevel(preferences, "danceability"),
    valence: validatePreferenceLevel(preferences, "valence"),
    acousticness: validatePreferenceLevel(preferences, "acousticness"),
    instrumentalness: validatePreferenceLevel(preferences, "instrumentalness"),
  };
}

/** Zwraca obiekt do dalszego sprawdzenia; odrzuca null, tablice i wartości proste. */
function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(
      "Niepoprawne preferencje playlisty: muszą być obiektem"
    );
  }

  return value as Record<string, unknown>;
}

/** Sprawdza obecność własnego pola i akceptuje tylko low, medium, high albo null. */
function validatePreferenceLevel(
  preferences: Record<string, unknown>,
  feature: PlaylistPreferenceFeature
): PlaylistPreferenceLevel | null {
  if (!Object.hasOwn(preferences, feature)) {
    throw new RequestValidationError(
      `Niepoprawne preferencje playlisty: brak pola ${feature}`
    );
  }

  const level = preferences[feature];

  if (
    level === null ||
    level === "low" ||
    level === "medium" ||
    level === "high"
  ) {
    return level;
  }

  throw new RequestValidationError(
    `Niepoprawne preferencje playlisty: pole ${feature} musi mieć wartość low, medium, high albo null`
  );
}

export { parsePlaylistGeneratorPreferences };
