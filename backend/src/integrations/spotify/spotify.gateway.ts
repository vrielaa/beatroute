import { SpotifyApiError } from "./spotify-api.error.js";
import type {
  SpotifyApiConfiguration,
  SpotifyGateway,
  SpotifyPlaylistApiResponse,
  SpotifyPlaylistContents,
  SpotifyPlaylistSnapshotApiResponse,
  SpotifyTopArtistsApiResponse,
  SpotifyTopItemsSelection,
  SpotifyTopTracksApiResponse,
  SpotifyTrackApiResponse,
  SpotifyUserProfileApiResponse,
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

  async function getCurrentUserTopTracks(
    accessToken: string,
    selection: SpotifyTopItemsSelection
  ): Promise<SpotifyTopTracksApiResponse> {
    return request(
      buildTopItemsEndpointPath("tracks", selection),
      accessToken,
      "Nie udało się pobrać top tracks ze Spotify"
    );
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
    const endpoint = `/playlists/${encodeURIComponent(playlistId)}`;
    const snapshotId = await readSnapshot();
    const trackIds: (string | null)[] = [];
    let total: number | null = null;

    do {
      const offset = trackIds.length;
      const page = await request<unknown>(
        `${endpoint}/items?limit=50&offset=${offset}`,
        accessToken,
        "Nie udało się odczytać zawartości playlisty"
      );

      if (
        !isObject(page) ||
        !Array.isArray(page["items"]) ||
        !Number.isInteger(page["total"]) ||
        typeof page["total"] !== "number" ||
        page["total"] < 0 ||
        page["total"] > 500 ||
        page["offset"] !== offset ||
        page["items"].length > 50 ||
        (total !== null && page["total"] !== total) ||
        (page["items"].length === 0 && offset < page["total"]) ||
        offset + page["items"].length > page["total"]
      ) {
        throw invalidPlaylistResponse();
      }

      total = page["total"];
      trackIds.push(...page["items"].map(readPlaylistTrackId));
    } while (trackIds.length < total);

    if ((await readSnapshot()) !== snapshotId) {
      throw invalidPlaylistResponse();
    }

    return { trackIds, snapshotId };

    /** Sprawdza identyfikator wersji bez pobierania pełnych metadanych playlisty. */
    async function readSnapshot(): Promise<string> {
      const data = await request<unknown>(
        `${endpoint}?fields=snapshot_id`,
        accessToken,
        "Nie udało się sprawdzić wersji playlisty"
      );

      if (
        !isObject(data) ||
        typeof data["snapshot_id"] !== "string" ||
        !data["snapshot_id"]
      ) {
        throw invalidPlaylistResponse();
      }

      return data["snapshot_id"];
    }
  }

  return {
    getSpotifyTrackById,
    getCurrentUserTopTracks,
    getCurrentUserTopArtists,
    getCurrentUserProfile,
    createPlaylist,
    addTracksToPlaylist,
    getPlaylistContents,
  };
}

/**
 * Buduje ścieżkę endpointu top items wraz z parametrami wyboru.
 *
 * @param resource - Rodzaj pobieranych zasobów.
 * @param selection - Limit i analizowany okres.
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

  return `/me/top/${resource}?${params.toString()}`;
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

/** Nie ujawnia odpowiedzi API, gdy zawartość playlisty nie może być bezpiecznie ustalona. */
function invalidPlaylistResponse(): SpotifyApiError {
  return new SpotifyApiError(
    "Nie udało się jednoznacznie odczytać zawartości playlisty. Spróbuj ponownie.",
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
