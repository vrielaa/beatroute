import { SpotifyApiError } from "./spotify-api.error.js";
import type {
  SpotifyApiConfiguration,
  SpotifyGateway,
  SpotifyPlaylistApiResponse,
  SpotifyPlaylistContents,
  SpotifyPlaylistMetadata,
  SpotifyPlaylistTrackPage,
  SpotifyPlaylistSnapshotApiResponse,
  SpotifyTopArtistsApiResponse,
  SpotifyTopItemsSelection,
  SpotifyTopTracksApiResponse,
  SpotifyTrackApiResponse,
  SpotifyUserProfileApiResponse,
  SpotifyPageSelection,
  SpotifySavedTracksApiResponse,
  SpotifySavedTrackApiResponse,
  SpotifyLibraryTrack,
} from "@integrations/spotify/spotify.types.js";

import {
  HttpRequestExecutionError,
  HttpResponseError,
  createHttpRequestExecutor,
  parseRetryAfterSeconds,
} from "@integrations/request-policy.js";
import {
  createRequestScheduler,
  RequestSchedulerPausedError,
} from "@integrations/request-scheduler.js";

const DEFAULT_SPOTIFY_API_ROOT = "https://api.spotify.com/v1";
const SPOTIFY_RETRYABLE_STATUSES = [502, 503, 504];

/**
 * Wspólny scheduler produkcyjnych odczytów, zapisów i ponowień Spotify Web API.
 * Rozpoczyna maksymalnie jedno zapytanie w każdych 1000 ms i dopuszcza do pięciu
 * jednocześnie trwających. Podczas pauzy odrzuca nowe i oczekujące operacje.
 * Limit tempa jest ustawieniem aplikacji, nie opublikowanym progiem Spotify.
 */
const spotifyRequestScheduler = createRequestScheduler({
  maxConcurrentRequests: 5,
  rateLimit: { maxRequests: 1, intervalMs: 1_000 },
  pauseBehavior: "reject",
});

/**
 * Tworzy gateway wykonujący autoryzowane zapytania do Spotify Web API.
 *
 * @param configuration - Transport, bazowy adres API, polityka żądań i scheduler.
 * @returns Operacje odczytu danych Spotify, tworzenia playlist i dodawania utworów.
 */
function createSpotifyGateway({
  fetchImpl = globalThis.fetch,
  apiRoot = DEFAULT_SPOTIFY_API_ROOT,
  requestPolicy,
  scheduler,
}: SpotifyApiConfiguration = {}): SpotifyGateway {
  const executeRequest = createHttpRequestExecutor({
    fetchImpl,
    policy: { retryableStatuses: SPOTIFY_RETRYABLE_STATUSES, ...requestPolicy },
    scheduler,
  });
  /**
   * Wykonuje autoryzowane zapytanie GET albo POST do Spotify Web API.
   * Korzysta ze wspólnego timeoutu i schedulera oraz mapuje błędy transportu
   * i odpowiedzi API na `SpotifyApiError`. Domyślna polityka ponawia przejściowe
   * błędy odczytów GET, ale nie ponawia `429` ani zapisów POST. Podczas pauzy
   * zwraca jej przyczynę i pozostały czas, bez wysyłania nowego żądania.
   *
   * @param endpoint - Ścieżka zasobu względem bazowego adresu API.
   * @param accessToken - Token dostępu użytkownika Spotify.
   * @param fallbackErrorMessage - Komunikat używany, gdy API nie zwraca własnego.
   * @param httpMethod - Metoda HTTP; domyślnie `GET`.
   * @param body - Opcjonalne dane serializowane do JSON; bez nich żądanie
   * nie ma body ani nagłówka `Content-Type: application/json`.
   * @returns Dane JSON odpowiedzi jako wskazany typ.
   */
  async function request<T>(
    endpoint: string,
    accessToken: string,
    fallbackErrorMessage: string,
    httpMethod: "GET" | "POST" = "GET",
    body?: unknown
  ): Promise<T> {
    let response: Response;
    let jsonBody: string | undefined;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      jsonBody = JSON.stringify(body);
    }

    try {
      response = await executeRequest(`${apiRoot}${endpoint}`, {
        method: httpMethod,
        headers,
        body: jsonBody,
      });
    } catch (cause) {
      if (cause instanceof RequestSchedulerPausedError) {
        const pauseStatus =
          cause.cause instanceof HttpResponseError ? cause.cause.status : 503;

        throw new SpotifyApiError(
          pauseStatus === 429
            ? "Zapytania do Spotify są wstrzymane po przekroczeniu limitu"
            : "Zapytania do Spotify są czasowo wstrzymane",
          pauseStatus,
          null,
          {
            upstreamStatus: null,
            retryAfterSeconds: Math.ceil(cause.remainingPauseMs / 1_000),
          }
        );
      }

      if (cause instanceof HttpRequestExecutionError) {
        throw new SpotifyApiError(
          cause.kind === "timeout"
            ? "Spotify nie odpowiedziało w wymaganym czasie"
            : "Nie udało się połączyć ze Spotify",
          cause.kind === "timeout" ? 504 : 502,
          cause.originalCause,
          {
            category: cause.kind === "timeout" ? "timeout" : "network",
          }
        );
      }

      throw cause;
    }

    const retryAfterSeconds = parseRetryAfterSeconds(
      response.headers.get("retry-after")
    );

    let data: unknown;

    try {
      data = await response.json();
    } catch (cause) {
      throw new SpotifyApiError(
        "Spotify zwrócił odpowiedź inną niż JSON",
        response.status,
        cause,
        { category: "invalid-response", retryAfterSeconds }
      );
    }

    if (!response.ok) {
      throw new SpotifyApiError(
        getSpotifyErrorMessage(data) ?? fallbackErrorMessage,
        response.status,
        data,
        { retryAfterSeconds }
      );
    }

    return data as T;
  }

  async function getSpotifyTrackById(
    spotifyTrackId: string,
    accessToken: string
  ): Promise<SpotifyTrackApiResponse> {
    return request(
      `/tracks/${encodeURIComponent(spotifyTrackId)}`,
      accessToken,
      "Nie udało się pobrać utworu ze Spotify"
    );
  }

  /**
   * Pobiera jedną stronę top utworów z wybranego okresu, domyślnie od offsetu 0.
   * Sprawdza liczniki, zgodność strony z żądaniem i sygnał dalszych wyników.
   * Pusta strona przed deklarowanym końcem jest błędem integracji, nie brakiem
   * utworów. Sprawdzanie paginacji nie jest pełną walidacją metadanych utworów.
   * Nie podąża za linkiem next ani nie pobiera automatycznie kolejnych stron.
   *
   * @param accessToken - Token użytkownika z uprawnieniem user-top-read.
   * @param selection - Rozmiar strony, okres i opcjonalne przesunięcie.
   * @returns Strona w kolejności Spotify; next: null oznacza koniec wyników.
   * @throws SpotifyApiError Gdy pobieranie lub walidacja paginacji zawiedzie.
   */
  async function getCurrentUserTopTracks(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopTracksApiResponse> {
    const data = await request<SpotifyTopTracksApiResponse>(
      buildTopItemsEndpointPath("tracks", selection),
      accessToken,
      "Nie udało się pobrać top tracks ze Spotify"
    );

    validateTopTracksPagination(data, selection);

    return data;
  }

  async function getCurrentUserTopArtists(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopArtistsApiResponse> {
    return request(
      buildTopItemsEndpointPath("artists", selection),
      accessToken,
      "Nie udało się pobrać top artists ze Spotify"
    );
  }

  async function getCurrentUserProfile(
    accessToken: string
  ): Promise<SpotifyUserProfileApiResponse> {
    return request(
      "/me",
      accessToken,
      "Nie udało się pobrać profilu użytkownika ze Spotify"
    );
  }

  /**
   * Pobiera jedną stronę zapisanych utworów zalogowanego użytkownika.
   * Wymaga tokenu z uprawnieniem user-library-read. Korzysta ze wspólnego
   * schedulera, timeoutu i polityki retry odczytów, bez ponawiania odpowiedzi 429.
   * Sprawdza strukturę strony, zgodność limitu i offsetu z żądaniem oraz pola
   * utworów zadeklarowane w SpotifyLibraryTrack. Błędna odpowiedź 200 jest
   * błędem integracji; jej treść nie trafia do danych błędu.
   * Zachowuje kolejność, duplikaty, daty zapisu i pozycje z track: null.
   * Nie przycina nazw, nie filtruje utworów lokalnych lub nieodtwarzalnych
   * ani nie wymaga niepustych metadanych; ocena ich przydatności należy do
   * przygotowania zbioru. Nie pobiera osobno metadanych ani cech audio.
   * Nie odczytuje następnej strony i nie podąża za adresami next lub previous.
   *
   * @param accessToken - Token użytkownika z dostępem do zapisanych utworów.
   * @param selection - Żądany rozmiar strony od 1 do 50 oraz nieujemny offset.
   * @returns Strona z pozycjami biblioteki, licznikami i linkami paginacji.
   * @throws SpotifyApiError Gdy odczyt zawiedzie lub odpowiedź nie spełnia kontraktu.
   */
  async function getCurrentUserSavedTracks(
    accessToken: string,
    selection: SpotifyPageSelection
  ): Promise<SpotifySavedTracksApiResponse> {
    const params = new URLSearchParams({
      limit: String(selection.limit),
      offset: String(selection.offset),
    });

    const data = await request<unknown>(
      `/me/tracks?${params.toString()}`,
      accessToken,
      "Nie udało się pobrać zapisanych utworów ze Spotify"
    );

    if (!isObject(data) || Array.isArray(data)) {
      throw invalidSavedTracksResponse();
    }

    const items = data["items"];
    const total = data["total"];
    const limit = data["limit"];
    const offset = data["offset"];

    const href = data["href"];
    const next = data["next"];
    const previous = data["previous"];

    if (
      !Array.isArray(items) ||
      typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < 0
    ) {
      throw invalidSavedTracksResponse();
    }

    const hasUnexpectedEmptyPage =
      items.length === 0 && selection.offset < total;

    const isPaginationValid =
      limit === selection.limit &&
      offset === selection.offset &&
      items.length <= selection.limit &&
      selection.offset + items.length <= total;

    if (!items.every(isSavedTrackItem)) {
      throw invalidSavedTracksResponse();
    }

    if (!isPaginationValid || hasUnexpectedEmptyPage) {
      throw invalidSavedTracksResponse();
    }

    if (
      typeof limit !== "number" ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      throw invalidSavedTracksResponse();
    }

    const arePageLinksValid =
      typeof href === "string" &&
      (next === null || typeof next === "string") &&
      (previous === null || typeof previous === "string");

    if (!arePageLinksValid) {
      throw invalidSavedTracksResponse();
    }

    return {
      items,
      total,
      limit,
      offset,
      href,
      next,
      previous,
    };
  }

  /**
   * Tworzy pustą, prywatną playlistę na koncie zalogowanego użytkownika.
   * Wymaga tokenu użytkownika z uprawnieniem `playlist-modify-private`.
   * Zapis POST nie jest automatycznie ponawiany, aby uniknąć tworzenia duplikatów.
   *
   * @param accessToken - Token dostępu uzyskany po autoryzacji użytkownika.
   * @param name - Nazwa tworzonej playlisty.
   * @returns Odpowiedź Spotify zawierająca dane utworzonej playlisty.
   */
  async function createPlaylist(
    accessToken: string,
    name: string
  ): Promise<SpotifyPlaylistApiResponse> {
    return request(
      "/me/playlists",
      accessToken,
      "Nie udało się utworzyć playlisty na Spotify",
      "POST",
      { name, public: false }
    );
  }

  /**
   * Dopisuje jedną partię od 1 do 100 utworów na końcu istniejącej playlisty.
   * Zamienia identyfikatory utworów na URI Spotify i zachowuje ich kolejność.
   * Zapis POST nie jest automatycznie ponawiany, aby uniknąć dodania duplikatów.
   *
   * @param accessToken - Token użytkownika z uprawnieniem do modyfikacji playlisty.
   * @param playlistId - Identyfikator playlisty, do której dopisywane są utwory.
   * @param trackIds - Identyfikatory utworów w docelowej kolejności.
   * @returns Odpowiedź Spotify zawierająca identyfikator nowej wersji playlisty.
   * @throws {RangeError} Gdy partia jest pusta albo zawiera więcej niż 100 utworów.
   */
  async function addTracksToPlaylist(
    accessToken: string,
    playlistId: string,
    trackIds: string[]
  ): Promise<SpotifyPlaylistSnapshotApiResponse> {
    if (trackIds.length === 0 || trackIds.length > 100) {
      throw new RangeError(
        "Jedno żądanie dodania utworów musi zawierać od 1 do 100 identyfikatorów"
      );
    }

    const uris = trackIds.map((trackId) => `spotify:track:${trackId}`);

    return request(
      `/playlists/${encodeURIComponent(playlistId)}/items`,
      accessToken,
      "Nie udało się dodać utworów do playlisty na Spotify",
      "POST",
      { uris }
    );
  }

  /**
   * Odczytuje zawartość playlisty w kolejnych stronach po 50 pozycji, do 500 łącznie.
   * Sprawdza wersję przed i po pobraniu, aby nie zwrócić mieszanki różnych wersji.
   * Nie korzysta z cache ani adresów next zwróconych przez API. Zachowuje braki jako
   * null; dla relinkowanego utworu używa pierwotnego ID z linked_from, gdy jest dostępne.
   * Nie wykonuje zapisów. Wymaga playlist-read-private dla prywatnej playlisty.
   *
   * @param accessToken - Token użytkownika uprawnionego do odczytu playlisty.
   * @param playlistId - Identyfikator playlisty utworzonej przez generator.
   * @returns ID wszystkich pozycji oraz wersja niezmieniona podczas odczytu.
   * @throws SpotifyApiError Gdy API zawiedzie, dane są niepełne, lista przekracza
   * 500 pozycji lub jej zawartość zmieni się podczas pobierania.
   */
  async function getPlaylistContents(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistContents> {
    const snapshotId = await readPlaylistSnapshot(accessToken, playlistId);
    const trackIds: (string | null)[] = [];
    let total: number | null = null;

    do {
      const offset = trackIds.length;
      const page = await readPlaylistItemsPage(accessToken, playlistId, {
        limit: 50,
        offset,
      });

      if (page.total > 500 || (total !== null && page.total !== total)) {
        throw invalidPlaylistResponse();
      }

      total = page.total;
      trackIds.push(...page.items.map(readPlaylistTrackId));
    } while (trackIds.length < total);

    if ((await readPlaylistSnapshot(accessToken, playlistId)) !== snapshotId) {
      throw invalidPlaylistResponse();
    }

    return { trackIds, snapshotId };
  }

  /** Pobiera tylko wersję; wspólny walidator nie ujawnia niepoprawnej odpowiedzi API. */
  async function readPlaylistSnapshot(
    accessToken: string,
    playlistId: string
  ): Promise<string> {
    const data = await request<unknown>(
      `/playlists/${encodeURIComponent(playlistId)}?fields=snapshot_id`,
      accessToken,
      "Nie udało się sprawdzić wersji playlisty"
    );
    return readPlaylistSnapshotId(data);
  }

  /**
   * Pobiera ID, nazwę i wersję playlisty, bez jej zawartości i bez sprawdzania właściciela.
   * Dostęp do pozycji weryfikuje Spotify przy odczycie strony; inny właściciel nie
   * wyklucza współtwórcy. Nie odczytuje profilu ani pozostałych playlist użytkownika.
   */
  async function getPlaylistMetadata(
    accessToken: string,
    playlistId: string
  ): Promise<SpotifyPlaylistMetadata> {
    const data = await request<unknown>(
      `/playlists/${encodeURIComponent(playlistId)}?fields=id,name,snapshot_id`,
      accessToken,
      "Nie udało się odczytać playlisty"
    );
    const snapshotId = readPlaylistSnapshotId(data);
    if (
      !isObject(data) ||
      data["id"] !== playlistId ||
      typeof data["name"] !== "string"
    ) {
      throw invalidPlaylistResponse();
    }
    return { id: playlistId, name: data["name"], snapshotId };
  }

  /**
   * Odczytuje jedną stronę z metadanymi do generatora. Zachowuje pozycje jako null
   * dla podcastów, plików lokalnych i niedostępnych utworów. Sprawdza używane pola,
   * ale nie wymaga pozostałych danych pełnego utworu. Nie pobiera kolejnej strony.
   */
  async function getPlaylistItemsPage(
    accessToken: string,
    playlistId: string,
    selection: SpotifyPageSelection
  ): Promise<SpotifyPlaylistTrackPage> {
    const page = await readPlaylistItemsPage(
      accessToken,
      playlistId,
      selection
    );
    return { ...page, items: page.items.map(readPlaylistSourceTrack) };
  }

  /** Wspólny odczyt i kontrola paginacji importu oraz wznawiania zapisu, bez mapowania pozycji. */
  async function readPlaylistItemsPage(
    accessToken: string,
    playlistId: string,
    selection: SpotifyPageSelection
  ): Promise<{ items: unknown[]; offset: number; total: number }> {
    const params = new URLSearchParams({
      limit: String(selection.limit),
      offset: String(selection.offset),
    });
    const data = await request<unknown>(
      `/playlists/${encodeURIComponent(playlistId)}/items?${params}`,
      accessToken,
      "Nie udało się odczytać zawartości playlisty"
    );
    if (!isObject(data) || Array.isArray(data)) throw invalidPlaylistResponse();
    const { items, offset, total } = data;
    if (
      !Array.isArray(items) ||
      typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      offset !== selection.offset ||
      items.length > selection.limit ||
      offset + items.length > total ||
      (items.length === 0 && offset < total)
    ) {
      throw invalidPlaylistResponse();
    }
    return { items, offset, total };
  }

  return {
    getSpotifyTrackById,
    getCurrentUserTopTracks,
    getCurrentUserTopArtists,
    getCurrentUserProfile,
    createPlaylist,
    addTracksToPlaylist,
    getPlaylistContents,
    getPlaylistMetadata,
    getPlaylistItemsPage,
    getCurrentUserSavedTracks,
  };
}

/**
 * Buduje ścieżkę endpointu top items wraz z parametrami wyboru.
 *
 * @param resource - Rodzaj pobieranych zasobów.
 * @param selection - Limit, analizowany okres oraz offset dla top utworów.
 * @returns Ścieżka gotowa do przekazania do gatewaya.
 */
function buildTopItemsEndpointPath(
  resource: "tracks" | "artists",
  selection: SpotifyTopItemsSelection
): string {
  const params = new URLSearchParams({
    limit: String(selection.limit),
    time_range: selection.timeRange,
  });

  if (resource === "tracks") {
    params.set("offset", String(selection.offset ?? 0));
  }

  return `/me/top/${resource}?${params.toString()}`;
}

/**
 * Sprawdza paginację top utworów bez zmiany zawartości i kolejności strony.
 * Odrzuca rozbieżne liczniki, pustą stronę przed końcem i niespójny link next.
 * Pusta strona na końcu lub za końcem zbioru jest poprawna i ma next: null.
 * Linki służą wyłącznie jako dane odpowiedzi; funkcja nie wykonuje zapytań.
 *
 * @param value - Odpowiedź JSON Spotify.
 * @param selection - Parametry strony wysłane do Spotify.
 * @throws SpotifyApiError Gdy nie można bezpiecznie ustalić postępu odczytu.
 */
function validateTopTracksPagination(
  value: unknown,
  selection: SpotifyTopItemsSelection
): void {
  if (!isObject(value) || Array.isArray(value)) {
    throw invalidTopTracksResponse();
  }

  const { items, total, limit, offset, href, next, previous } = value;

  if (
    !Array.isArray(items) ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    throw invalidTopTracksResponse();
  }

  const nextOffset = offset + items.length;
  const hasMoreTracks = nextOffset < total;
  const isPaginationValid =
    limit === selection.limit &&
    offset === (selection.offset ?? 0) &&
    items.length <= selection.limit &&
    Number.isSafeInteger(nextOffset) &&
    (items.length === 0 || nextOffset <= total);
  const hasUnexpectedEmptyPage = items.length === 0 && offset < total;
  const arePageLinksValid =
    typeof href === "string" &&
    (previous === null || typeof previous === "string") &&
    (hasMoreTracks
      ? typeof next === "string" && next.trim().length > 0
      : next === null);

  if (!isPaginationValid || hasUnexpectedEmptyPage || !arePageLinksValid) {
    throw invalidTopTracksResponse();
  }
}

/** Tworzy błąd paginacji bez dołączania treści odpowiedzi Spotify. */
function invalidTopTracksResponse(): SpotifyApiError {
  return new SpotifyApiError(
    "Spotify zwróciło niepoprawną paginację top utworów",
    200,
    null,
    { category: "invalid-response" }
  );
}

/**
 * Odczytuje komunikat błędu z nieznanej odpowiedzi Spotify.
 *
 * @param data - Niezweryfikowane dane JSON.
 * @returns Komunikat Spotify albo `null` dla innego kształtu odpowiedzi.
 */
function getSpotifyErrorMessage(data: unknown): string | null {
  if (!isObject(data) || !isObject(data["error"])) {
    return null;
  }

  const message = data["error"]["message"];

  return typeof message === "string" && message ? message : null;
}

/** Sprawdza, czy wartość jest obiektem możliwym do bezpiecznego odczytu. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Odczytuje ID pozycji bez usuwania nieznanych, lokalnych lub niedostępnych wpisów. */
function readPlaylistTrackId(value: unknown): string | null {
  if (
    !isObject(value) ||
    value["is_local"] !== false ||
    !isObject(value["item"])
  ) {
    return null;
  }

  const item = value["item"];

  if (item["type"] !== "track") {
    return null;
  }

  const linkedFrom = item["linked_from"];
  const id = isObject(linkedFrom) ? linkedFrom["id"] : item["id"];

  return typeof id === "string" && /^[A-Za-z0-9]{22}$/.test(id) ? id : null;
}

/** Odczytuje wersję wspólną dla importu playlisty i kontroli częściowego zapisu. */
function readPlaylistSnapshotId(value: unknown): string {
  if (
    !isObject(value) ||
    typeof value["snapshot_id"] !== "string" ||
    !value["snapshot_id"].trim()
  ) {
    throw invalidPlaylistResponse();
  }
  return value["snapshot_id"];
}

/** Oddziela poprawne pominięcia od naruszenia kontraktu metadanych utworu Spotify. */
function readPlaylistSourceTrack(value: unknown): SpotifyLibraryTrack | null {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    typeof value["is_local"] !== "boolean" ||
    !("item" in value)
  ) {
    throw invalidPlaylistResponse();
  }
  const item = value["item"];
  if (value["is_local"] || item === null) return null;
  if (
    !isObject(item) ||
    Array.isArray(item) ||
    typeof item["type"] !== "string"
  )
    throw invalidPlaylistResponse();
  if (
    item["type"] !== "track" ||
    item["is_local"] === true ||
    item["is_playable"] === false
  )
    return null;
  if (item["id"] === null) return null;
  if (!isSpotifyLibraryTrack(item)) throw invalidPlaylistResponse();
  return item;
}

/**
 * Sprawdza obecność tekstowej daty zapisu i poprawnych danych utworu albo track: null.
 * Nie sprawdza formatu daty. Niedostępny utwór jest poprawną pozycją odpowiedzi,
 * niezależnie od daty jego zapisania; nie oznacza to dopuszczenia go do generatora.
 */
function isSavedTrackItem(
  value: unknown
): value is SpotifySavedTrackApiResponse {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }

  if (typeof value["added_at"] !== "string") {
    return false;
  }

  const track = value["track"];

  return track === null || isSpotifyLibraryTrack(track);
}

/**
 * Sprawdza typy ID, nazwy, nazw wykonawców i opcjonalnych flag dostępności.
 * Nie waliduje formatu Spotify ID, nie wymaga niepustych tekstów ani listy
 * wykonawców. Dodatkowe pola Spotify pozostawia bez zmian i ich nie sprawdza.
 */
function isSpotifyLibraryTrack(value: unknown): value is SpotifyLibraryTrack {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }

  const id = value["id"];
  const name = value["name"];
  const artists = value["artists"];
  const isLocal = value["is_local"];
  const isPlayable = value["is_playable"];

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    !Array.isArray(artists)
  ) {
    return false;
  }

  const hasValidArtists = artists.every(
    (artist) =>
      isObject(artist) &&
      !Array.isArray(artist) &&
      typeof artist["name"] === "string"
  );

  const hasValidLocalFlag =
    isLocal === undefined || typeof isLocal === "boolean";

  const hasValidPlayableFlag =
    isPlayable === undefined || typeof isPlayable === "boolean";

  return hasValidArtists && hasValidLocalFlag && hasValidPlayableFlag;
}

/** Nie ujawnia odpowiedzi API, gdy zawartość playlisty nie może być bezpiecznie ustalona. */
function invalidPlaylistResponse(): SpotifyApiError {
  return new SpotifyApiError(
    "Nie udało się jednoznacznie odczytać zawartości playlisty. Spróbuj ponownie.",
    200,
    null,
    { category: "invalid-response" }
  );
}

/** Tworzy błąd bez ujawniania niepoprawnej odpowiedzi Spotify. */
function invalidSavedTracksResponse(): SpotifyApiError {
  return new SpotifyApiError(
    "Spotify zwróciło niepoprawną odpowiedź zapisanych utworów",
    200,
    null,
    { category: "invalid-response" }
  );
}

/** Gateway korzystający z produkcyjnej konfiguracji Spotify Web API. */
const defaultSpotifyGateway = createSpotifyGateway({
  scheduler: spotifyRequestScheduler,
});

export { createSpotifyGateway, defaultSpotifyGateway };
