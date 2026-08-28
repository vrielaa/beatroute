import { SpotifyApiError } from "./spotify-api.error.js";
import type {
  SpotifyApiConfiguration,
  SpotifyGateway,
  SpotifyTopArtistsApiResponse,
  SpotifyTopItemsSelection,
  SpotifyTopTracksApiResponse,
  SpotifyTrackApiResponse,
  SpotifyUserProfileApiResponse,
} from "./spotify.types.js";

const DEFAULT_SPOTIFY_API_ROOT = "https://api.spotify.com/v1";

/**
 * Tworzy gateway wykonujący autoryzowane zapytania do Spotify Web API.
 *
 * @param configuration - Implementacja `fetch` i opcjonalny bazowy adres API.
 * @returns Operacje pobierające utwory, artystów i profil użytkownika.
 */
export function createSpotifyGateway({
  fetchImpl = globalThis.fetch,
  apiRoot = DEFAULT_SPOTIFY_API_ROOT,
}: SpotifyApiConfiguration = {}): SpotifyGateway {
  /**
   * Wykonuje pojedyncze zapytanie GET i mapuje nieudaną odpowiedź na
   * `SpotifyApiError`.
   *
   * @param endpoint - Ścieżka zasobu względem bazowego adresu API.
   * @param accessToken - Token dostępu użytkownika Spotify.
   * @param fallbackErrorMessage - Komunikat używany, gdy API nie zwraca własnego.
   * @returns Dane JSON odpowiedzi jako wskazany typ.
   */
  async function request<T>(
    endpoint: string,
    accessToken: string,
    fallbackErrorMessage: string
  ): Promise<T> {
    const response = await fetchImpl(`${apiRoot}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data: unknown = await response.json();

    if (!response.ok) {
      throw new SpotifyApiError(
        getSpotifyErrorMessage(data) ?? fallbackErrorMessage,
        response.status,
        data
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

  return {
    getSpotifyTrackById,
    getCurrentUserTopTracks,
    getCurrentUserTopArtists,
    getCurrentUserProfile,
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

const defaultSpotifyGateway = createSpotifyGateway();

export const getSpotifyTrackById = defaultSpotifyGateway.getSpotifyTrackById;
export const getCurrentUserTopTracks =
  defaultSpotifyGateway.getCurrentUserTopTracks;
export const getCurrentUserTopArtists =
  defaultSpotifyGateway.getCurrentUserTopArtists;
export const getCurrentUserProfile =
  defaultSpotifyGateway.getCurrentUserProfile;
