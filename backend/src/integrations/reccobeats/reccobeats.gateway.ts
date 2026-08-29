import { appConfig } from "../../config/app.config.js";
import { ReccoBeatsApiError } from "./reccobeats-api.error.js";

import type {
  ReccoBeatsTracksApiResponse,
  ReccoBeatsTrackApiResponse,
} from "./reccobeats.types.js";

/** Konfiguracja połączenia z API ReccoBeats. */
type ReccoBeatsGatewayConfiguration = {
  /** Implementacja `fetch`, którą można zastąpić podczas testów. */
  fetchImpl?: typeof fetch;
  /** Bazowy adres API ReccoBeats. */
  baseUrl?: string;
};

/** Surowe cechy audio zwracane przez endpoint pojedynczego utworu. */
type ReccoBeatsAudioFeaturesApiResponse = {
  /** Udział brzmienia akustycznego w skali od 0 do 1. */
  acousticness?: number | null;
  /** Przydatność utworu do tańca w skali od 0 do 1. */
  danceability?: number | null;
  /** Energia utworu w skali od 0 do 1. */
  energy?: number | null;
  /** Udział partii instrumentalnych w skali od 0 do 1. */
  instrumentalness?: number | null;
  /** Tonacja zapisana jako numer klasy wysokości dźwięku. */
  key?: number | null;
  /** Prawdopodobieństwo wykonania na żywo w skali od 0 do 1. */
  liveness?: number | null;
  /** Średnia głośność utworu wyrażona w decybelach. */
  loudness?: number | null;
  /** Tryb harmoniczny: molowy (`0`) albo durowy (`1`). */
  mode?: number | null;
  /** Udział mowy w nagraniu w skali od 0 do 1. */
  speechiness?: number | null;
  /** Tempo utworu wyrażone w uderzeniach na minutę. */
  tempo?: number | null;
  /** Metrum utworu, na przykład `4` dla metrum 4/4. */
  timeSignature?: number | null;
  /** Pozytywność brzmienia w skali od 0 do 1. */
  valence?: number | null;
};

/** Operacje odczytu danych udostępniane przez gateway ReccoBeats. */
export type ReccoBeatsGateway = {
  /**
   * Wyszukuje utwory ReccoBeats odpowiadające identyfikatorom Spotify.
   *
   * @param spotifyTrackIds - Identyfikatory utworów Spotify.
   * @returns Znormalizowana lista utworów znalezionych przez ReccoBeats.
   */
  findTracksBySpotifyIds(
    spotifyTrackIds: string[]
  ): Promise<ReccoBeatsTrackApiResponse[]>;

  /**
   * Pobiera cechy audio jednego utworu ReccoBeats.
   *
   * @param reccoBeatsTrackId - Wewnętrzny identyfikator utworu ReccoBeats.
   * @returns Surowe cechy audio zwrócone przez zewnętrzne API.
   */
  getTrackAudioFeatures(
    reccoBeatsTrackId: string
  ): Promise<ReccoBeatsAudioFeaturesApiResponse>;
};

/**
 * Sprowadza obsługiwane warianty odpowiedzi wyszukiwarki do jednej tablicy.
 *
 * @param tracksResponse - Odpowiedź ReccoBeats zawierająca utwory bezpośrednio
 * albo wewnątrz jednego z obsługiwanych kontenerów.
 * @returns Lista utworów lub pusta tablica, gdy odpowiedź nie zawiera wyników.
 */
function normalizeTracksResponse(
  tracksResponse: ReccoBeatsTracksApiResponse
): ReccoBeatsTrackApiResponse[] {
  if (Array.isArray(tracksResponse)) {
    return tracksResponse;
  }

  if (Array.isArray(tracksResponse?.content)) {
    return tracksResponse.content;
  }

  if (Array.isArray(tracksResponse?.items)) {
    return tracksResponse.items;
  }

  const objectResponse = tracksResponse.object;

  if (Array.isArray(objectResponse)) {
    return objectResponse;
  }

  if (
    objectResponse &&
    !Array.isArray(objectResponse) &&
    Array.isArray(objectResponse.items)
  ) {
    return objectResponse.items;
  }

  return [];
}

/**
 * Tworzy gateway ukrywający transport HTTP i strukturę odpowiedzi ReccoBeats.
 *
 * @param configuration - Adres API oraz implementacja mechanizmu HTTP.
 * @returns Operacje wyszukiwania utworów i pobierania ich cech audio.
 */
export function createReccoBeatsGateway({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.reccoBeats.baseUrl,
}: ReccoBeatsGatewayConfiguration): ReccoBeatsGateway {
  /**
   * Wykonuje zapytanie GET i sprawdza status odpowiedzi ReccoBeats.
   *
   * @param endpointPath - Ścieżka endpointu wraz z parametrami query.
   * @returns Dane JSON o typie oczekiwanym przez wywołującą operację.
   * @throws {ReccoBeatsApiError} Gdy API zwróci nieudany status HTTP.
   */
  async function request<ResponseData>(
    endpointPath: string
  ): Promise<ResponseData> {
    const response = await fetchImpl(`${baseUrl}${endpointPath}`, {
      headers: {
        Accept: "application/json",
      },
    });

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new ReccoBeatsApiError(
        "Nie udało się pobrać danych z ReccoBeats",
        response.status,
        data
      );
    }

    return data as ResponseData;
  }

  /** Wyszukuje utwory ReccoBeats na podstawie identyfikatorów Spotify. */
  async function findTracksBySpotifyIds(
    spotifyTrackIds: string[]
  ): Promise<ReccoBeatsTrackApiResponse[]> {
    const params = new URLSearchParams();

    for (const id of spotifyTrackIds) {
      params.append("ids", id);
    }

    const response = await request<ReccoBeatsTracksApiResponse>(
      `/v1/track?${params.toString()}`
    );

    return normalizeTracksResponse(response);
  }

  /** Pobiera surowe cechy audio utworu wskazanego identyfikatorem ReccoBeats. */
  async function getTrackAudioFeatures(
    reccoBeatsTrackId: string
  ): Promise<ReccoBeatsAudioFeaturesApiResponse> {
    return request(
      `/v1/track/${encodeURIComponent(reccoBeatsTrackId)}/audio-features`
    );
  }

  return {
    findTracksBySpotifyIds,
    getTrackAudioFeatures,
  };
}

const defaultReccoBeatsGateway = createReccoBeatsGateway({});
export { defaultReccoBeatsGateway };
/** Wyszukuje utwory przy użyciu domyślnej konfiguracji ReccoBeats. */
export const findTracksBySpotifyIds =
  defaultReccoBeatsGateway.findTracksBySpotifyIds;
/** Pobiera cechy audio przy użyciu domyślnej konfiguracji ReccoBeats. */
export const getTrackAudioFeatures =
  defaultReccoBeatsGateway.getTrackAudioFeatures;
