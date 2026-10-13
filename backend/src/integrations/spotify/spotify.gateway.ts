import { SpotifyApiError } from "./spotify-api.error.js";
import type {
  SpotifyApiConfiguration,
  SpotifyGateway,
  SpotifyPlaylistApiResponse,
  SpotifyTopArtistsApiResponse,
  SpotifyTopItemsSelection,
  SpotifyTopTracksApiResponse,
  SpotifyTrackApiResponse,
  SpotifyUserProfileApiResponse,
} from "@integrations/spotify/spotify.types.js";

import {
  HttpRequestExecutionError,
  createHttpRequestExecutor,
  parseRetryAfterSeconds,
} from "@integrations/request-policy.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";

const DEFAULT_SPOTIFY_API_ROOT = "https://api.spotify.com/v1";

/** Wspólny scheduler wszystkich produkcyjnych zapytań do Spotify Web API. */
const spotifyRequestScheduler = createRequestScheduler({
  maxConcurrentRequests: 5,
});

/**
 * Tworzy gateway wykonujący autoryzowane zapytania do Spotify Web API.
 *
 * @param configuration - Transport, bazowy adres API, polityka żądań i scheduler.
 * @returns Operacje odczytu danych Spotify i tworzenia prywatnych playlist.
 */
function createSpotifyGateway({
  fetchImpl = globalThis.fetch,
  apiRoot = DEFAULT_SPOTIFY_API_ROOT,
  requestPolicy,
  scheduler,
}: SpotifyApiConfiguration = {}): SpotifyGateway {
  const executeRequest = createHttpRequestExecutor({
    fetchImpl,
    policy: requestPolicy,
    scheduler,
  });
  /**
   * Wykonuje autoryzowane zapytanie GET albo POST do Spotify Web API.
   * Korzysta ze wspólnego timeoutu i schedulera oraz mapuje błędy transportu
   * i odpowiedzi API na `SpotifyApiError`. Polityka retry ponawia odczyty GET,
   * ale nie ponawia zapisów POST.
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

  return {
    getSpotifyTrackById,
    getCurrentUserTopTracks,
    getCurrentUserTopArtists,
    getCurrentUserProfile,
    createPlaylist,
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

/** Gateway korzystający z produkcyjnej konfiguracji Spotify Web API. */
const defaultSpotifyGateway = createSpotifyGateway({
  scheduler: spotifyRequestScheduler,
});

export { createSpotifyGateway, defaultSpotifyGateway };
