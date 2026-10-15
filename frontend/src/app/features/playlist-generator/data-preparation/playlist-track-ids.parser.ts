import type { PlaylistTrackIdsFile } from '../playlist-generator.models';

const MAX_TRACKS_LIMIT = 500;
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

/**
 * Sprawdza plik wersji 1 zawierający wyłącznie identyfikatory utworów Spotify.
 * Wymaga od 1 do 500 wpisów, przycina teksty i usuwa duplikaty po przycięciu.
 * Zachowuje wielkość liter i kolejność pierwszych wystąpień. Zwraca nowy obiekt
 * bez dodatkowych pól; nie modyfikuje wejścia ani nie przechowuje ID między wywołaniami.
 * Nie sprawdza istnienia utworów w Spotify ani dostępności ich pomiarów.
 * Nie odczytuje pliku, nie parsuje tekstu JSON i nie wywołuje zewnętrznych API.
 *
 * @param value - Dane uzyskane z JSON.parse lub body żądania.
 * @returns Plik ze sprawdzonymi, unikalnymi identyfikatorami do uzupełnienia danych.
 * @throws Error Gdy struktura, wersja, liczba wpisów lub format ID są niepoprawne.
 */
function parsePlaylistTrackIdsFile(value: unknown): PlaylistTrackIdsFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plik z identyfikatorami musi być obiektem');
  }

  const file = value as Record<string, unknown>;

  if (!Object.hasOwn(file, 'version') || file['version'] !== 1) {
    throw new Error('Nieobsługiwana wersja pliku: pole version musi mieć wartość 1');
  }

  const trackIds = file['spotifyTrackIds'];

  if (!Object.hasOwn(file, 'spotifyTrackIds') || !Array.isArray(trackIds)) {
    throw new Error('Pole spotifyTrackIds musi być tablicą');
  }

  if (trackIds.length === 0 || trackIds.length > MAX_TRACKS_LIMIT) {
    throw new Error(`Plik musi zawierać od 1 do ${MAX_TRACKS_LIMIT} identyfikatorów utworów`);
  }

  const uniqueIds = new Set<string>();

  for (let index = 0; index < trackIds.length; index += 1) {
    const id = parseSpotifyTrackId(trackIds[index], index);
    uniqueIds.add(id);
  }

  return { version: 1, spotifyTrackIds: Array.from(uniqueIds) };
}

/** Przycina ID i sprawdza jego format, bez zamiany wielkości liter ani odczytu API. */
function parseSpotifyTrackId(value: unknown, index: number): string {
  if (typeof value !== 'string') {
    throw new Error(`Pole spotifyTrackIds[${index}] musi być tekstowym identyfikatorem Spotify`);
  }

  const id = value.trim();

  if (!SPOTIFY_TRACK_ID_PATTERN.test(id)) {
    throw new Error(
      `Pole spotifyTrackIds[${index}] musi zawierać Spotify ID złożone z 22 liter lub cyfr`
    );
  }

  return id;
}

export { parsePlaylistTrackIdsFile };
