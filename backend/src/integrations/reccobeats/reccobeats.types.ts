import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
} from "@domain/tracks/types.js";

/** Surowe, opcjonalne cechy audio zwracane przez API ReccoBeats. */
type ReccoBeatsAudioFeatures = {
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
  /** Średnia głośność wyrażona w decybelach. */
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

/** Skrócone dane utworu zwracane przez wyszukiwarkę ReccoBeats. */
type ReccoBeatsTrackApiResponse = {
  /** Wewnętrzny identyfikator utworu ReccoBeats. */
  id: string;
  /** Odnośnik pozwalający powiązać wynik z utworem Spotify. */
  href: string;
  /** Nazwa utworu. */
  name: string;
};

/** Obsługiwane warianty odpowiedzi endpointu wyszukiwania utworów. */
type ReccoBeatsTracksApiResponse =
  | ReccoBeatsTrackApiResponse[]
  | {
      content?: ReccoBeatsTrackApiResponse[];
      items?: ReccoBeatsTrackApiResponse[];
      object?:
        | ReccoBeatsTrackApiResponse[]
        | {
            items?: ReccoBeatsTrackApiResponse[];
          };
    };

type ReccoBeatsService = {
  /**
   * Pobiera cechy audio dla pojedynczego utworu Spotify.
   *
   * @param spotifyId - Identyfikator utworu Spotify.
   * @returns Cechy audio albo opis błędu, jeśli nie udało się ich pobrać.
   */
  getTrackAudioFeaturesBySpotifyId(
    spotifyId: string
  ): Promise<TrackAudioFeatures>;

  /**
   * Pobiera cechy audio dla wielu utworów Spotify.
   *
   * @param spotifyIds - Lista identyfikatorów utworów Spotify.
   * @returns Lista wyników, w której każdy element odpowiada jednemu identyfikatorowi.
   */
  getManyTrackAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<TrackAudioFeaturesResult[]>;
};

export type {
  ReccoBeatsAudioFeatures,
  ReccoBeatsTrackApiResponse,
  ReccoBeatsTracksApiResponse,
  ReccoBeatsService,
};
