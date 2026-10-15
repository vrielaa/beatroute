import { RequestValidationError } from "@http/request-validation-error.js";

/**
 * Odczytuje pozycję początkową strony zapisanych utworów Spotify z body żądania.
 * Wymaga własnego pola offset z liczbą całkowitą od 0 do 499, bez konwersji
 * tekstu ani wartości domyślnej. Rozmiar strony ustala serwis, nie klient.
 * Ignoruje dodatkowe pola i nie modyfikuje wejścia.
 *
 * @param value - Body żądania przygotowania strony biblioteki.
 * @returns Offset mieszczący się w pierwszych 500 pozycjach biblioteki.
 * @throws RequestValidationError Gdy body nie jest obiektem lub offset jest niepoprawny.
 */
function parseSavedTracksOffset(value: unknown): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(
      "Parametry odczytu zapisanych utworów muszą być obiektem"
    );
  }

  if (!Object.hasOwn(value, "offset") || !("offset" in value)) {
    throw new RequestValidationError("Pole offset jest wymagane");
  }

  const offset = value.offset;

  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 499
  ) {
    throw new RequestValidationError(
      "Pole offset musi być liczbą całkowitą od 0 do 499"
    );
  }

  return offset;
}

export { parseSavedTracksOffset };
