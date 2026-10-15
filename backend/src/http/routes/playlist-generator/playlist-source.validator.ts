import { RequestValidationError } from "@http/request-validation-error.js";
import type { PlaylistSourceSelection } from "@application/playlist-generator/types.js";

/**
 * Odczytuje ID playlisty, offset i wersję z body przygotowania jednej strony.
 * Przyjmuje wyłącznie ID, nie URL. Wymaga offsetu 0–499 bez konwersji tekstu.
 * Pierwsza strona wymaga snapshotId: null, a kontynuacja niepustej wersji Spotify.
 * Ignoruje dodatkowe pola, w szczególności token i deklaracje właściciela.
 *
 * @param value - Body żądania przygotowania źródłowej playlisty.
 * @returns Nowy wybór strony z przyciętym ID i niezmienioną, nieprzezroczystą wersją.
 * @throws RequestValidationError Gdy brakuje pola lub jego wartość jest niepoprawna.
 */
function parsePlaylistSourceSelection(value: unknown): PlaylistSourceSelection {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Parametry playlisty muszą być obiektem");
  }
  if (
    !("playlistId" in value) ||
    typeof value.playlistId !== "string" ||
    !/^[A-Za-z0-9]{22}$/.test(value.playlistId.trim())
  ) {
    throw new RequestValidationError("Podaj poprawne ID playlisty Spotify");
  }
  if (
    !("offset" in value) ||
    typeof value.offset !== "number" ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    value.offset > 499
  ) {
    throw new RequestValidationError(
      "Pole offset musi być liczbą całkowitą od 0 do 499"
    );
  }
  if (!("snapshotId" in value))
    throw new RequestValidationError("Pole snapshotId jest wymagane");
  const snapshotId = value.snapshotId;
  if (snapshotId !== null && typeof snapshotId !== "string")
    throw new RequestValidationError(
      "Pole snapshotId musi być tekstem albo null"
    );
  const isValidVersion =
    value.offset === 0
      ? snapshotId === null
      : snapshotId !== null && snapshotId.trim().length > 0;
  if (!isValidVersion)
    throw new RequestValidationError(
      "Pierwsza strona wymaga snapshotId: null, kolejne wersji playlisty"
    );
  return {
    playlistId: value.playlistId.trim(),
    offset: value.offset,
    snapshotId,
  };
}

export { parsePlaylistSourceSelection };
