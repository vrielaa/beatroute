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

/** Dane pojedynczego utworu zwracane przez Spotify Web API. */
type SpotifyTrackApiResponse = {
  /** Identyfikator utworu w Spotify. */
  id: string;
  /** Nazwa utworu. */
  name: string;
  /** Artyści wykonujący utwór. */
  artists: SpotifyArtistReference[];
  /** Album zawierający utwór. */
  album: SpotifyAlbumApiResponse;
  /** Czas trwania utworu w milisekundach. */
  duration_ms: number;
  /** Pozycja utworu na albumie. */
  track_number: number;
  /** Popularność utworu w skali Spotify. */
  popularity?: number;
  /** Publiczne odnośniki do utworu. */
  external_urls: SpotifyExternalUrls;
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

/** Konfiguracja połączenia ze Spotify Web API. */
type SpotifyApiConfiguration = {
  /** Implementacja `fetch`, którą można zastąpić w testach. */
  fetchImpl?: typeof globalThis.fetch;
  /** Bazowy adres Spotify Web API. */
  apiRoot?: string;
};

/** Operacje odczytu danych udostępniane przez gateway Spotify. */
type SpotifyGateway = {
  /** Pobiera pojedynczy utwór po jego identyfikatorze. */
  getSpotifyTrackById(
    spotifyTrackId: string,
    accessToken: string
  ): Promise<SpotifyTrackApiResponse>;
  /** Pobiera najczęściej słuchane utwory użytkownika. */
  getCurrentUserTopTracks(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopTracksApiResponse>;
  /** Pobiera najczęściej słuchanych artystów użytkownika. */
  getCurrentUserTopArtists(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopArtistsApiResponse>;
  /** Pobiera profil aktualnie zalogowanego użytkownika. */
  getCurrentUserProfile(
    accessToken: string
  ): Promise<SpotifyUserProfileApiResponse>;
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
};
