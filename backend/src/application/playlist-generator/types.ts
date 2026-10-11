/**
 * Plik JSON wskazujący utwory Spotify do przygotowania zbioru generatora.
 * Nie wymaga nazw, artystów ani pomiarów — te dane uzupełni aplikacja.
 * Walidacja przycina ID i usuwa duplikaty, zachowując kolejność pierwszych wystąpień.
 *
 * @property version - Wersja formatu pliku; obsługiwana jest wartość 1.
 * @property spotifyTrackIds - Identyfikatory utworów Spotify; plik zawiera od 1 do 500 wpisów.
 * Każdy ID ma 22 znaki: cyfry lub litery alfabetu łacińskiego, z rozróżnieniem wielkości liter.
 *
 * @example
 * { version: 1, spotifyTrackIds: ["3sNVsP50132BTNlImLx70i"] }
 */
type PlaylistTrackIdsFile = {
  version: 1;
  spotifyTrackIds: string[];
};

export type { PlaylistTrackIdsFile };
