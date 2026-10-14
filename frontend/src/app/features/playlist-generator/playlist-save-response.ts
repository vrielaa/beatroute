import { HttpErrorResponse } from '@angular/common/http';
import type { PlaylistSaveProgress, SavedPlaylist } from './playlist-generator.models';

/**
 * Sprawdza potwierdzenie pełnego zapisu przed pokazaniem sukcesu w UI.
 * Wymaga danych playlisty, bezpiecznego linku Spotify i całkowitej liczby od 1 do 500.
 * Kopiuje wyłącznie pola modelu, bez dodatkowych danych otrzymanej odpowiedzi.
 *
 * @param value - JSON odpowiedzi endpointu zapisu.
 * @param expectedTrackCount - Liczba ID przekazanych w tym żądaniu; potwierdzenie musi ją obejmować.
 * @returns Sprawdzone potwierdzenie zapisu.
 * @throws Error Gdy backend nie zwrócił poprawnego potwierdzenia; nie oznacza to cofnięcia zapisu.
 */
function parseSavedPlaylist(value: unknown, expectedTrackCount: number): SavedPlaylist {
  const metadata = readPlaylistMetadata(value);

  if (
    !isRecord(value) ||
    !metadata ||
    typeof value['trackCount'] !== 'number' ||
    !Number.isInteger(value['trackCount']) ||
    value['trackCount'] < 1 ||
    value['trackCount'] > 500 ||
    value['trackCount'] !== expectedTrackCount
  ) {
    throw new Error('Nie otrzymano poprawnego potwierdzenia zapisu playlisty');
  }

  return { ...metadata, trackCount: value['trackCount'] };
}

/**
 * Odczytuje postęp wyłącznie z błędu HTTP o kodzie PLAYLIST_SAVE_INCOMPLETE.
 * Sprawdza dane playlisty, link Spotify i liczniki: od zera do liczby mniejszej
 * niż żądana, z żądaną liczbą od 1 do 500. Pomija dodatkowe i diagnostyczne pola.
 *
 * @param error - Nieznana przyczyna nieudanego żądania.
 * @returns Kopia sprawdzonego postępu albo null, gdy brak wiarygodnych danych.
 */
function readPartialPlaylistSaveProgress(error: unknown): PlaylistSaveProgress | null {
  const body = readErrorBody(error);

  if (body?.['code'] !== 'PLAYLIST_SAVE_INCOMPLETE' || !isRecord(body['details'])) {
    return null;
  }

  const progress = body['details']['progress'];
  const metadata = readPlaylistMetadata(progress);

  if (!isRecord(progress) || !metadata) {
    return null;
  }

  const confirmedTrackCount = progress['confirmedTrackCount'];
  const requestedTrackCount = progress['requestedTrackCount'];

  if (
    typeof confirmedTrackCount !== 'number' ||
    typeof requestedTrackCount !== 'number' ||
    !Number.isInteger(confirmedTrackCount) ||
    !Number.isInteger(requestedTrackCount) ||
    confirmedTrackCount < 0 ||
    requestedTrackCount < 1 ||
    requestedTrackCount > 500 ||
    confirmedTrackCount >= requestedTrackCount
  ) {
    return null;
  }

  return { ...metadata, confirmedTrackCount, requestedTrackCount };
}

/**
 * Wybiera komunikat zapisu bez wyświetlania surowej treści błędu z API.
 * Błąd częściowy ma pierwszeństwo przed statusem HTTP, również przy 401 i 403.
 * Brak połączenia, timeout i nierozpoznane błędy wymagają sprawdzenia Spotify:
 * brak potwierdzenia nie dowodzi, że operacja niczego nie zapisała.
 */
function getPlaylistSaveErrorMessage(error: unknown): string {
  const body = readErrorBody(error);

  if (body?.['code'] === 'PLAYLIST_SAVE_INCOMPLETE') {
    return 'Nie potwierdzono pełnego zapisu.';
  }

  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 400:
        return 'Nie udało się zapisać playlisty. Sprawdź jej nazwę i wybór utworów.';
      case 401:
        return 'Połącz ponownie konto Spotify, aby zapisać playlistę.';
      case 403:
        return 'Spotify odmówiło zapisu. Połącz ponownie konto i zezwól na zapisywanie prywatnych playlist.';
      case 413:
        return 'Żądanie zapisu jest zbyt duże. Wybierz mniej utworów (maksymalnie 500).';
      case 429: {
        const header = error.headers.get('Retry-After')?.trim();
        const seconds = header ? Number(header) : null;
        return seconds !== null && Number.isSafeInteger(seconds) && seconds >= 0
          ? `Przekroczono limit zapytań Spotify. Odczekaj ${seconds} s. Sprawdź swoje playlisty przed kolejnym zapisem.`
          : 'Przekroczono limit zapytań Spotify. Odczekaj i sprawdź swoje playlisty przed kolejnym zapisem.';
      }
    }
  }

  return 'Nie otrzymano potwierdzenia zapisu. Sprawdź swoje playlisty w Spotify przed kolejną próbą.';
}

/** Wybiera krótki komunikat wznowienia, bez ujawniania treści odpowiedzi dostawcy. */
function getPlaylistResumeErrorMessage(error: unknown): string {
  const code = readErrorBody(error)?.['code'];

  switch (code) {
    case 'PLAYLIST_CONTENTS_CHANGED':
      return 'Playlista została zmieniona. Wznowienie zatrzymane.';
    case 'PLAYLIST_RESUME_UNAVAILABLE':
      return 'Brak zapisu do wznowienia w tej sesji.';
    case 'PLAYLIST_SAVE_IN_PROGRESS':
      return 'Zapis tej playlisty już trwa.';
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) {
      return 'Połącz ponownie Spotify i zezwól na odczyt oraz zapis playlist.';
    }

    if (error.status === 429) {
      const header = error.headers.get('Retry-After')?.trim();
      const seconds = header ? Number(header) : null;

      return seconds !== null && Number.isSafeInteger(seconds) && seconds >= 0
        ? `Limit Spotify. Ponów za ${seconds} s.`
        : 'Limit Spotify. Spróbuj później.';
    }
  }

  return 'Nie potwierdzono pełnego zapisu. Spróbuj wznowić ponownie.';
}

/** Rozpoznaje konflikty wymagające decyzji użytkownika zamiast ponownego dopisywania. */
function isPlaylistResumptionBlocked(error: unknown): boolean {
  const code = readErrorBody(error)?.['code'];
  return code === 'PLAYLIST_CONTENTS_CHANGED' || code === 'PLAYLIST_RESUME_UNAVAILABLE';
}

/** Odczytuje wyłącznie obiekt error z JSON-a HttpErrorResponse. */
function readErrorBody(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body: unknown = error.error;
  return isRecord(body) && isRecord(body['error']) ? body['error'] : null;
}

/** Sprawdza metadane i link do konkretnej playlisty w domenie open.spotify.com. */
function readPlaylistMetadata(
  value: unknown
): Pick<SavedPlaylist, 'id' | 'name' | 'spotifyUrl'> | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, name, spotifyUrl } = value;

  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof name !== 'string' ||
    !name.trim() ||
    typeof spotifyUrl !== 'string'
  ) {
    return null;
  }

  try {
    const url = new URL(spotifyUrl);
    if (
      url.origin !== 'https://open.spotify.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== `/playlist/${encodeURIComponent(id)}`
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { id, name, spotifyUrl };
}

/** Sprawdza, czy wartość jest obiektem JSON, a nie null ani tablicą. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export {
  parseSavedPlaylist,
  readPartialPlaylistSaveProgress,
  getPlaylistSaveErrorMessage,
  getPlaylistResumeErrorMessage,
  isPlaylistResumptionBlocked,
};
