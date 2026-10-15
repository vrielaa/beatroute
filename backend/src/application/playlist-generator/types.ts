import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
} from "@domain/playlist-generator/types.js";
import type { TrackAudioFeaturesResult } from "@domain/tracks/types.js";
import type { SpotifySavedTracksApiResponse } from "@integrations/spotify/spotify.types.js";

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
 * Wynik pomyślnego zapisu wszystkich wybranych utworów, nowego lub wznowionego.
 * Nie opisuje częściowego zapisu ani stanu partii, której wyniku nie potwierdzono.
 *
 * @property id - Identyfikator utworzonej playlisty w Spotify.
 * @property name - Nazwa playlisty zwrócona po jej utworzeniu.
 * @property spotifyUrl - Odnośnik pozwalający otworzyć playlistę w Spotify.
 * @property trackCount - Liczba utworów, których zapis potwierdzono we wszystkich partiach.
 *
 * @example
 * { id: "playlist-id", name: "Na siłownię", spotifyUrl: "https://open.spotify.com/playlist/playlist-id", trackCount: 50 }
 */
type SavedPlaylist = {
  id: string;
  name: string;
  spotifyUrl: string;
  trackCount: number;
};

/**
 * Stan zapisu po utworzeniu playlisty, zachowany w razie błędu dodawania utworów.
 * Liczba potwierdzonych utworów nie jest pewną liczbą wszystkich utworów w Spotify:
 * niepotwierdzona partia mogła zostać zapisana przed utratą odpowiedzi.
 * Nie zawiera tokenu, identyfikatorów utworów ani szczegółów błędu integracji.
 *
 * @property id - Identyfikator playlisty utworzonej przed wystąpieniem błędu.
 * @property name - Nazwa utworzonej playlisty.
 * @property spotifyUrl - Odnośnik umożliwiający sprawdzenie playlisty w Spotify.
 * @property confirmedTrackCount - Liczba utworów z potwierdzonych partii albo
 * sprawdzonych podczas wznowienia w Spotify, powiększona o kolejne potwierdzone partie.
 * Nie obejmuje pozycji, których obecności nadal nie można potwierdzić.
 * @property requestedTrackCount - Liczba utworów wybranych na początku operacji.
 *
 * @example
 * { id: "playlist-id", name: "Na siłownię", spotifyUrl: "https://open.spotify.com/playlist/playlist-id", confirmedTrackCount: 100, requestedTrackCount: 250 }
 */
type PlaylistSaveProgress = {
  id: string;
  name: string;
  spotifyUrl: string;
  confirmedTrackCount: number;
  requestedTrackCount: number;
};

/**
 * Pierwotny wybór potrzebny do wznowienia nieukończonego zapisu.
 * Jest przechowywany w sesji backendu, nie odczytywany z żądania wznowienia.
 *
 * @property progress - Dane utworzonej playlisty i ostatni potwierdzony postęp.
 * @property trackIds - Kopia ID wybranych przed pierwszym zapisem, w oryginalnej kolejności.
 */
type PendingPlaylistSave = {
  progress: PlaylistSaveProgress;
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
 * Metadane utworu przygotowane do wyświetlenia w generatorze playlisty.
 * Nie zawierają pomiarów audio, tokenów ani pełnej odpowiedzi Spotify.
 *
 * @property name - Przycięta, niepusta nazwa utworu.
 * @property artists - Przycięte, niepuste nazwy wykonawców.
 */
type PlaylistTrackMetadata = {
  name: string;
  artists: string[];
};

/**
 * Utwór pominięty podczas pobierania danych, przed filtrowaniem wymagań.
 * Nie jest to odrzucenie przez kryteria użytkownika ani ocena preferencji.
 *
 * @property spotifyId - ID utworu z wybranego źródła danych.
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
 * Wszystkie listy zachowują kolejność utworów źródłowych. Zbiór może być pusty,
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
 * @property getCurrentUserSavedTracks - Pobiera jedną stronę biblioteki z metadanymi
 * utworów i paginacją. Nie pobiera cech audio ani kolejnych stron.
 */
type PlaylistDatasetDependencies = {
  getSpotifyTrackById(
    spotifyId: string,
    accessToken: string
  ): Promise<PlaylistSourceTrack>;
  getAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]>;
  getCurrentUserSavedTracks(
    accessToken: string,
    { limit, offset }: { limit: number; offset: number }
  ): Promise<SpotifySavedTracksApiResponse>;
};

/**
 * Operacje zewnętrzne potrzebne do utworzenia playlisty i dodania wybranych utworów.
 * Serwis otrzymuje funkcje jako zależności, bez produkcyjnego gatewaya lub konfiguracji.
 *
 * @property createPlaylist - Tworzy pustą, prywatną playlistę z tokenem użytkownika.
 * Zwraca jej identyfikator, nazwę i odnośnik Spotify potrzebne do dalszego zapisu.
 * @property addTracksToPlaylist - Dopisuje jedną partię od 1 do 100 ID w podanej kolejności.
 * Zakończenie Promise potwierdza zapis partii; błąd przerywa operację.
 * Treść odpowiedzi nie jest wykorzystywana przez serwis zapisu.
 * @property getPlaylistContents - Odczytuje wszystkie pozycje jednej wersji playlisty;
 * null pozostaje na pozycji niedostępnego lub nieznanego utworu.
 */
type PlaylistSaveDependencies = {
  createPlaylist(
    accessToken: string,
    name: string
  ): Promise<{
    id: string;
    name: string;
    external_urls: { spotify: string };
  }>;
  addTracksToPlaylist(
    accessToken: string,
    playlistId: string,
    trackIds: string[]
  ): Promise<unknown>;
  getPlaylistContents(
    accessToken: string,
    playlistId: string
  ): Promise<{ trackIds: (string | null)[]; snapshotId: string }>;
};

/**
 * Postęp jednej strony biblioteki Spotify, niezależny od liczby przygotowanych utworów.
 * Dotyczy pozycji źródłowych, więc uwzględnia również duplikaty i pominięcia.
 *
 * @property offset - Indeks pierwszej odczytanej pozycji, liczony od zera.
 * @property processedItems - Liczba pozycji tej strony, bez dodawania offsetu.
 * @property totalItems - Całkowita liczba zapisanych pozycji według Spotify; może przekraczać 500.
 * @property nextOffset - Kolejny indeks albo null po końcu biblioteki lub osiągnięciu limitu 500.
 */
type SavedTracksPagination = {
  offset: number;
  processedItems: number;
  totalItems: number;
  nextOffset: number | null;
};

/**
 * Jedna przygotowana strona zapisanych utworów, bez rankingu i danych autoryzacji.
 * Deduplikacja dotyczy tej strony; łączenie kolejnych stron wymaga osobnego sprawdzenia ID.
 *
 * @property preparedDataset - Unikalne utwory z pomiarami oraz informacje o brakach
 * metadanych i cech audio dla znanych, poprawnych ID.
 * @property pagination - Postęp liczony z pozycji Spotify, nie z długości gotowego zbioru.
 * @property unavailableItemsCount - Liczba pozycji z track: null, lokalnych, jawnie
 * nieodtwarzalnych lub z błędnym ID. Nie obejmuje duplikatów ani pominięć
 * już opisanych w preparedDataset.skippedTracks.
 */
type PreparedSavedTracksPage = {
  preparedDataset: PreparedPlaylistDataset;
  pagination: SavedTracksPagination;
  unavailableItemsCount: number;
};

export type {
  PlaylistTrackIdsFile,
  PlaylistToSave,
  SavedPlaylist,
  PlaylistSaveProgress,
  PendingPlaylistSave,
  PlaylistSourceTrack,
  PlaylistTrackMetadata,
  SkippedPlaylistTrack,
  IncompletePlaylistTrack,
  PreparedPlaylistDataset,
  PlaylistDatasetDependencies,
  PlaylistSaveDependencies,
  SavedTracksPagination,
  PreparedSavedTracksPage,
};
