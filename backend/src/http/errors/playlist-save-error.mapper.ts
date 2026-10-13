import { PartialPlaylistSaveError } from "@application/playlist-generator/partial-playlist-save.error.js";
import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { createErrorResponse } from "./error-response.js";
import { mapIntegrationError } from "./integration-error.mapper.js";
import type { MappedHttpError } from "./types.js";

/**
 * Zwraca bezpieczną odpowiedź dla nieukończonego zapisu już utworzonej playlisty.
 * Udostępnia jej dane i liczbę utworów z potwierdzonych partii, nie przesądzając
 * o wyniku partii zakończonej błędem. Nie ujawnia przyczyny, jej komunikatu,
 * odpowiedzi zewnętrznego API ani dodatkowych pól dopisanych do postępu.
 *
 * Dla znanego błędu integracji zachowuje status HTTP i ewentualny Retry-After.
 * Nierozpoznana przyczyna oznacza status 500. Kod PLAYLIST_SAVE_INCOMPLETE
 * wskazuje, że przed kolejnym zapisem należy sprawdzić istniejącą playlistę:
 * sam status lub Retry-After nie oznacza, że można bezpiecznie ponowić POST.
 *
 * @param error - Błąd dodawania utworów po utworzeniu playlisty.
 * @returns Status, publiczny opis postępu i opcjonalny nagłówek Retry-After.
 */
function mapPartialPlaylistSaveError(
  error: PartialPlaylistSaveError
): MappedHttpError {
  const integrationCause =
    error.cause instanceof IntegrationApiError ? error.cause : null;
  const mappedCause =
    integrationCause === null ? null : mapIntegrationError(integrationCause);
  const retryAfterSeconds = integrationCause?.retryAfterSeconds ?? null;

  return {
    status: mappedCause?.status ?? 500,
    body: createErrorResponse(
      "PLAYLIST_SAVE_INCOMPLETE",
      "Nie potwierdzono zapisu wszystkich utworów. Sprawdź utworzoną playlistę przed ponownym zapisem.",
      {
        progress: {
          id: error.progress.id,
          name: error.progress.name,
          spotifyUrl: error.progress.spotifyUrl,
          confirmedTrackCount: error.progress.confirmedTrackCount,
          requestedTrackCount: error.progress.requestedTrackCount,
        },
        ...(retryAfterSeconds === null ? {} : { retryAfterSeconds }),
      }
    ),
    ...(mappedCause?.headers ? { headers: mappedCause.headers } : {}),
  };
}

export { mapPartialPlaylistSaveError };
