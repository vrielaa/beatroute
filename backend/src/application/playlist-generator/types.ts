import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
} from "@domain/playlist-generator/types.js";
import type { TrackAudioFeaturesResult } from "@domain/tracks/types.js";

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

/**
 * Dane potrzebne do zapisania wybranych utworów jako nowej playlisty.
 * Nie zawierają tokenu użytkownika, ocen dopasowania ani cech audio.
 *
 * @property name - Przycięta, niepusta nazwa playlisty, do 100 znaków.
 * @property trackIds - Od 1 do 500 unikalnych identyfikatorów Spotify w kolejności
 * wybranej przez użytkownika. Każdy ID ma 22 litery lub cyfry; wielkość liter ma znaczenie.
 *
 * @example
 * { name: "Na siłownię", trackIds: ["3sNVsP50132BTNlImLx70i"] }
 */
type PlaylistToSave = {
  name: string;
  trackIds: string[];
};

/**
 * Minimalne metadane wymagane od źródła katalogu utworów.
 * Pełna odpowiedź Spotify może zawierać więcej pól, ale przygotowanie zbioru
 * potrzebuje tylko nazwy utworu i nazw wykonawców.
 *
 * @property name - Nazwa utworu, przycinana przed zapisaniem w zbiorze.
 * @property artists - Wykonawcy opisani nazwami; lista musi zawierać co najmniej jedną nazwę.
 */
type PlaylistSourceTrack = {
  name: string;
  artists: { name: string }[];
};

/**
 * Utwór pominięty podczas pobierania danych, przed filtrowaniem wymagań.
 * Nie jest to odrzucenie przez kryteria użytkownika ani ocena preferencji.
 *
 * @property spotifyId - ID utworu z pliku użytkownika.
 * @property reason - metadata-unavailable: brak utworu lub wymaganych metadanych;
 * audio-features-unavailable: nieudany odczyt albo brak wszystkich ośmiu użytecznych pomiarów.
 */
type SkippedPlaylistTrack = {
  spotifyId: string;
  reason: "metadata-unavailable" | "audio-features-unavailable";
};

/**
 * Utwór włączony do zbioru mimo częściowych braków pomiarów.
 * Brakujące pomiary pozostają null; generator uwzględnia je zgodnie z wymaganiami i preferencjami.
 *
 * @property spotifyId - ID utworu w przygotowanym zbiorze.
 * @property missingFeatures - Nazwy niedostępnych cech z ośmiu pomiarów generatora.
 */
type IncompletePlaylistTrack = {
  spotifyId: string;
  missingFeatures: (keyof PlaylistAudioFeatures)[];
};

/**
 * Przygotowany zbiór oraz informacje o kompletności pobranych danych.
 * Wszystkie listy zachowują kolejność utworów z pliku. Zbiór może być pusty,
 * gdy żaden utwór nie ma metadanych i użytecznego pomiaru; UI nie powinno wtedy wywoływać generatora.
 * Awarie całych zapytań są wyjątkami, nie pustym zbiorem ani wpisami skippedTracks.
 *
 * @property dataset - Metadane i pomiary gotowe do kolejnych analiz bez pobierania API.
 * @property skippedTracks - Utwory pominięte podczas przygotowania, z bezpiecznym kodem powodu.
 * @property incompleteTracks - Utwory zachowane w zbiorze z częściowymi brakami pomiarów.
 */
type PreparedPlaylistDataset = {
  dataset: PlaylistDataset;
  skippedTracks: SkippedPlaylistTrack[];
  incompleteTracks: IncompletePlaylistTrack[];
};

/**
 * Operacje pobierania danych potrzebne do przygotowania zbioru playlisty.
 * Serwis nie importuje produkcyjnych gatewayów ani konfiguracji środowiska.
 *
 * @property getSpotifyTrackById - Pobiera metadane jednego ID z tokenem użytkownika;
 * brak utworu jest błędem integracji ze statusem źródłowym 404.
 * @property getAudioFeaturesBySpotifyIds - Pobiera wyniki cech audio dla wskazanych ID;
 * błąd pojedynczego utworu jest wpisem wyniku, a awaria całego odczytu wyjątkiem.
 */
type PlaylistDatasetDependencies = {
  getSpotifyTrackById(
    spotifyId: string,
    accessToken: string
  ): Promise<PlaylistSourceTrack>;
  getAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]>;
};

export type {
  PlaylistTrackIdsFile,
  PlaylistToSave,
  PlaylistSourceTrack,
  SkippedPlaylistTrack,
  IncompletePlaylistTrack,
  PreparedPlaylistDataset,
  PlaylistDatasetDependencies,
};
