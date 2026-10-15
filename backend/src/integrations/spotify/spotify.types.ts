import type { HttpRequestPolicy } from "@integrations/request-policy.js";
import type { RequestScheduler } from "@integrations/request-scheduler.js";

/** Okres statystyk obsługiwany przez endpointy Spotify top items. */
type SpotifyTimeRange = "short_term" | "medium_term" | "long_term";

/** Odnośniki do zasobów w aplikacji Spotify. */
type SpotifyExternalUrls = {
  /** Publiczny adres zasobu w Spotify. */
  spotify?: string;
};

/** Obraz zwracany przez Spotify. */
type SpotifyImage = {
  /** Adres obrazu. */
  url: string;
  /** Wysokość obrazu albo `null`, gdy Spotify jej nie podaje. */
  height: number | null;
  /** Szerokość obrazu albo `null`, gdy Spotify jej nie podaje. */
  width: number | null;
};

/** Skrócone dane artysty zagnieżdżone w innym zasobie Spotify. */
type SpotifyArtistReference = {
  /** Nazwa artysty. */
  name: string;
};

/** Dane albumu potrzebne podczas przetwarzania utworu. */
type SpotifyAlbumApiResponse = {
  /** Nazwa albumu. */
  name: string;
  /** Artyści przypisani do albumu. */
  artists: SpotifyArtistReference[];
  /** Okładki albumu. */
  images: SpotifyImage[];
};

/**
 * Dane pojedynczego utworu zwracane przez Spotify Web API.
 *
 * @property id - Identyfikator utworu w Spotify.
 * @property name - Nazwa utworu.
 * @property artists - Artyści wykonujący utwór.
 * @property album - Album zawierający utwór.
 * @property duration_ms - Czas trwania w milisekundach.
 * @property track_number - Pozycja utworu na albumie.
 * @property popularity - Popularność, jeśli Spotify ją udostępnia.
 * @property external_urls - Publiczne odnośniki do utworu.
 * @property is_local - Informacja o pliku lokalnym, jeśli została podana.
 * @property is_playable - Dostępność odtwarzania, jeśli została podana.
 */
type SpotifyTrackApiResponse = {
  id: string;
  name: string;
  artists: SpotifyArtistReference[];
  album: SpotifyAlbumApiResponse;
  duration_ms: number;
  track_number: number;
  popularity?: number;
  external_urls: SpotifyExternalUrls;
  is_local?: boolean;
  is_playable?: boolean;
};

/** Liczba obserwujących zasób Spotify. */
type SpotifyFollowers = {
  /** Łączna liczba obserwujących. */
  total: number;
};

/** Dane artysty zwracane przez Spotify Web API. */
type SpotifyArtistApiResponse = {
  /** Identyfikator artysty w Spotify. */
  id: string;
  /** Nazwa artysty. */
  name: string;
  /** Gatunki przypisane artyście przez Spotify. */
  genres: string[];
  /** Zdjęcia artysty. */
  images: SpotifyImage[];
  /** Informacje o obserwujących. */
  followers: SpotifyFollowers;
  /** Popularność artysty w skali Spotify. */
  popularity: number;
  /** Publiczne odnośniki do artysty. */
  external_urls: SpotifyExternalUrls;
};

/** Stronicowana odpowiedź Spotify zawierająca zasoby jednego typu. */
type SpotifyPage<T> = {
  /** Adres bieżącej strony wyników. */
  href: string;
  /** Zasoby znajdujące się na bieżącej stronie. */
  items: T[];
  /** Maksymalna liczba zasobów na stronie. */
  limit: number;
  /** Adres następnej strony albo `null`. */
  next: string | null;
  /** Przesunięcie bieżącej strony. */
  offset: number;
  /** Adres poprzedniej strony albo `null`. */
  previous: string | null;
  /** Łączna liczba dostępnych zasobów. */
  total: number;
};

/** Odpowiedź endpointu zwracającego najczęściej słuchane utwory. */
type SpotifyTopTracksApiResponse = SpotifyPage<SpotifyTrackApiResponse>;

/** Odpowiedź endpointu zwracającego najczęściej słuchanych artystów. */
type SpotifyTopArtistsApiResponse = SpotifyPage<SpotifyArtistApiResponse>;

/** Profil aktualnie zalogowanego użytkownika Spotify. */
type SpotifyUserProfileApiResponse = {
  /** Identyfikator użytkownika. */
  id: string;
  /** Publiczna nazwa użytkownika. */
  display_name?: string | null;
  /** Adres e-mail udostępniony aplikacji. */
  email?: string | null;
  /** Kod kraju użytkownika. */
  country?: string | null;
  /** Zdjęcia profilowe. */
  images?: SpotifyImage[];
  /** Publiczne odnośniki do profilu. */
  external_urls?: SpotifyExternalUrls;
  /** Informacje o obserwujących użytkownika. */
  followers?: SpotifyFollowers;
};

/** Parametry wyboru najczęściej słuchanych zasobów. */
type SpotifyTopItemsSelection = {
  /** Maksymalna liczba zwracanych elementów. */
  limit: number;
  /** Analizowany okres. */
  timeRange: SpotifyTimeRange;
};

/**
 * Określa zależności i ustawienia gatewaya Spotify Web API.
 *
 * @property fetchImpl - Implementacja `fetch`, którą można zastąpić w testach.
 * @property apiRoot - Bazowy adres Spotify Web API.
 * @property requestPolicy - Nadpisania timeoutu oraz zasad retry.
 * @property scheduler - Opcjonalny scheduler współdzielący limity zapytań.
 */
type SpotifyApiConfiguration = {
  fetchImpl?: typeof globalThis.fetch;
  apiRoot?: string;
  requestPolicy?: Partial<HttpRequestPolicy>;
  scheduler?: RequestScheduler;
};

/**
 * Udostępnia odczyty danych Spotify, tworzenie playlist i dodawanie utworów.
 *
 * @property getSpotifyTrackById - Pobiera pojedynczy utwór po identyfikatorze.
 * @property getCurrentUserTopTracks - Pobiera najczęściej słuchane utwory użytkownika.
 * @property getCurrentUserTopArtists - Pobiera najczęściej słuchanych artystów użytkownika.
 * @property getCurrentUserProfile - Pobiera profil zalogowanego użytkownika.
 * @property getCurrentUserSavedTracks - Pobiera jedną stronę zapisanych utworów
 * wraz z metadanymi; wymaga user-library-read i nie pobiera kolejnych stron.
 * @property createPlaylist - Tworzy pustą, prywatną playlistę na koncie użytkownika.
 * @property addTracksToPlaylist - Dopisuje od 1 do 100 utworów do istniejącej playlisty w podanej kolejności.
 * @property getPlaylistContents - Odczytuje do 500 pozycji playlisty, zachowując kolejność i braki ID.
 */
type SpotifyGateway = {
  getSpotifyTrackById(
    spotifyTrackId: string,
    accessToken: string
  ): Promise<SpotifyTrackApiResponse>;
  getCurrentUserTopTracks(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopTracksApiResponse>;
  getCurrentUserTopArtists(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopArtistsApiResponse>;
  getCurrentUserProfile(
    accessToken: string
  ): Promise<SpotifyUserProfileApiResponse>;
  createPlaylist(
    accessToken: string,
    name: string
  ): Promise<SpotifyPlaylistApiResponse>;
  addTracksToPlaylist(
    accessToken: string,
    playlistId: string,
    trackIds: string[]
  ): Promise<SpotifyPlaylistSnapshotApiResponse>;
  getPlaylistContents(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistContents>;
  getCurrentUserSavedTracks(
    accessToken: string,
    selection: SpotifyPageSelection
  ): Promise<SpotifySavedTracksApiResponse>;
};

/** Skrócone dane utworu zwracane przez endpoint łączący Spotify z Last.fm. */
type SpotifyTrackSummary = {
  /** Identyfikator utworu w Spotify. */
  id: string;
  /** Nazwa utworu. */
  name: string;
  /** Nazwy wykonawców. */
  artists: string[];
  /** Nazwa albumu. */
  album: string | null;
  /** Czas trwania w milisekundach. */
  durationMs: number | null;
  /** Publiczny adres utworu w Spotify. */
  spotifyUrl: string | null;
};

/**
 * Opisuje pola odpowiedzi Spotify potrzebne po utworzeniu playlisty.
 *
 * @property id - Identyfikator playlisty używany podczas dodawania utworów.
 * @property name - Nazwa playlisty zwrócona przez Spotify.
 * @property external_urls - Odnośniki pozwalające otworzyć playlistę w Spotify.
 * @property external_urls.spotify - Adres playlisty w aplikacji lub witrynie Spotify.
 */
type SpotifyPlaylistApiResponse = {
  id: string;
  name: string;
  external_urls: {
    spotify: string;
  };
};

/**
 * Opisuje wersję playlisty zwróconą przez Spotify po zmianie jej zawartości.
 *
 * @property snapshot_id - Identyfikator wersji playlisty po dodaniu utworów.
 */
type SpotifyPlaylistSnapshotApiResponse = {
  snapshot_id: string;
};

/**
 * Zawartość playlisty odczytana ze wszystkich stron tej samej wersji Spotify.
 *
 * @property trackIds - ID w kolejności playlisty; null oznacza niedostępną, lokalną
 * lub inną niż utwór pozycję. Braki nie są usuwane, aby nie przesuwać kolejności.
 * @property snapshotId - Wersja playlisty, sprawdzona przed i po odczycie stron.
 */
type SpotifyPlaylistContents = {
  trackIds: (string | null)[];
  snapshotId: string;
};

/**
 * Parametry odczytu jednej strony zasobów Spotify.
 * Nie określają łącznej liczby pozycji w bibliotece ani limitu całego generatora.
 *
 * @property limit - Żądana liczba pozycji na stronie; dla zapisanych utworów od 1 do 50.
 * @property offset - Nieujemny indeks pierwszej pozycji, liczony od zera.
 */
type SpotifyPageSelection = {
  limit: number;
  offset: number;
};

/**
 * Dane utworu potrzebne podczas przygotowania zbioru z biblioteki Spotify.
 * Gateway sprawdza typy tych pól, bez wymagania pozostałych danych pełnego
 * utworu Spotify. Niepuste nazwy i przydatność utworu ocenia przygotowanie zbioru.
 * Ten typ nie zawiera pomiarów audio.
 *
 * @property id - Identyfikator utworu Spotify.
 * @property name - Nazwa utworu.
 * @property artists - Wykonawcy opisani nazwami.
 * @property is_local - Informacja, czy utwór jest plikiem lokalnym.
 * @property is_playable - Informacja o dostępności odtwarzania, jeśli została podana.
 */
type SpotifyLibraryTrack = {
  id: string;
  name: string;
  artists: SpotifyArtistReference[];
  is_local?: boolean;
  is_playable?: boolean;
};

/**
 * Pozycja w bibliotece zapisanych utworów.
 * Gateway zachowuje ją w całości, nie zastępuje samym polem track.
 *
 * @property added_at - Data zapisania utworu; gateway sprawdza typ string, nie format daty.
 * @property track - Dane utworu albo null, gdy są niedostępne. Brak danych utworu
 * nie usuwa pozycji ani daty zapisu z odpowiedzi.
 */
type SpotifySavedTrackApiResponse = {
  added_at: string;
  track: SpotifyLibraryTrack | null;
};

/**
 * Jedna strona zapisanych utworów po sprawdzeniu kontraktu przez gateway.
 * Pusta biblioteka ma items: [], total: 0 oraz next i previous ustawione na null.
 * Linki paginacji mogą być null i nie są automatycznie odczytywane.
 */
type SpotifySavedTracksApiResponse = SpotifyPage<SpotifySavedTrackApiResponse>;

export type {
  SpotifyTimeRange,
  SpotifyExternalUrls,
  SpotifyImage,
  SpotifyArtistReference,
  SpotifyAlbumApiResponse,
  SpotifyTrackApiResponse,
  SpotifyFollowers,
  SpotifyArtistApiResponse,
  SpotifyPage,
  SpotifyTopTracksApiResponse,
  SpotifyTopArtistsApiResponse,
  SpotifyUserProfileApiResponse,
  SpotifyTopItemsSelection,
  SpotifyApiConfiguration,
  SpotifyGateway,
  SpotifyTrackSummary,
  SpotifyPlaylistApiResponse,
  SpotifyPlaylistSnapshotApiResponse,
  SpotifyPlaylistContents,
  SpotifySavedTrackApiResponse,
  SpotifySavedTracksApiResponse,
  SpotifyPageSelection,
  SpotifyLibraryTrack,
};
