import { RequestValidationError } from "@http/request-validation-error.js";
import type {
  PlaylistRequirements,
  TempoRange,
} from "@domain/playlist-generator/types.js";

/**
 * Sprawdza obowiązkowe warunki filtrowania i zwraca ich znormalizowaną kopię.
 * Wymaga obecności wszystkich trzech pól. Null wyłącza dany warunek; liczba zero
 * pozostaje aktywnym maksimum speechiness lub liveness. Granice BPM muszą być
 * dodatnie, skończone i uporządkowane, a maksima cech należeć do zakresu 0–1.
 * Nie sprawdza utworów i nie ocenia preferencji rozmytych.
 *
 * @param value - Ustawienia użytkownika przed sprawdzeniem ich struktury i wartości.
 * @returns Sprawdzone wymagania, bez dodatkowych pól wejściowych.
 * @throws RequestValidationError Gdy brakuje pola lub jego wartość jest niepoprawna.
 */
function parsePlaylistRequirements(value: unknown): PlaylistRequirements {
  const requirements = requireRecord(
    value,
    "Niepoprawne wymagania playlisty: musi być obiektem"
  );

  if (!("tempoRange" in requirements)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: brak pola tempoRange"
    );
  }

  if (!("maxSpeechiness" in requirements)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: brak pola maxSpeechiness"
    );
  }

  if (!("maxLiveness" in requirements)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: brak pola maxLiveness"
    );
  }

  const tempoRange = validateTempoRange(requirements.tempoRange);
  const maxSpeechiness = validateSpeechiness(requirements.maxSpeechiness);
  const maxLiveness = validateLiveness(requirements.maxLiveness);

  return {
    tempoRange,
    maxSpeechiness,
    maxLiveness,
  };
}

/** Zwraca obiekt do dalszego sprawdzenia; odrzuca null i tablice. */
function requireRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(message);
  }

  return value as Record<string, unknown>;
}

/** Sprawdza dodatnie granice BPM i ich kolejność; null wyłącza zakres. */
function validateTempoRange(tempoRangeUnknown: unknown): TempoRange | null {
  if (tempoRangeUnknown === null) {
    return tempoRangeUnknown;
  }

  const tempoRange = requireRecord(
    tempoRangeUnknown,
    "Niepoprawne wymagania playlisty: tempoRange musi być obiektem lub null"
  );

  if (!("min" in tempoRange) || !("max" in tempoRange)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: brak pola min lub max w tempoRange"
    );
  }

  if (
    typeof tempoRange.min !== "number" ||
    typeof tempoRange.max !== "number"
  ) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: min i max w tempoRange muszą być liczbami"
    );
  }

  if (!Number.isFinite(tempoRange.min) || !Number.isFinite(tempoRange.max)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: min i max w tempoRange muszą być liczbami skończonymi"
    );
  }

  if (tempoRange.min <= 0 || tempoRange.max <= 0) {
    throw new RequestValidationError(
      "Granice zakresu BPM muszą być większe od zera"
    );
  }

  if (tempoRange.min > tempoRange.max) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: min nie może być większy niż max w tempoRange"
    );
  }

  return {
    min: tempoRange.min,
    max: tempoRange.max,
  };
}

/** Akceptuje maksimum speechiness w zakresie 0–1 albo null bez ograniczenia. */
function validateSpeechiness(value: unknown): number | null {
  if (value === null) {
    return value;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: maxSpeechiness musi być liczbą lub null"
    );
  }

  if (value < 0 || value > 1) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: maxSpeechiness musi być między 0 i 1"
    );
  }

  return value;
}

/** Akceptuje maksimum liveness w zakresie 0–1 albo null bez ograniczenia. */
function validateLiveness(value: unknown): number | null {
  if (value === null) {
    return value;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: maxLiveness musi być liczbą lub null"
    );
  }

  if (value < 0 || value > 1) {
    throw new RequestValidationError(
      "Niepoprawne wymagania playlisty: maxLiveness musi być między 0 i 1"
    );
  }

  return value;
}

export { parsePlaylistRequirements };
