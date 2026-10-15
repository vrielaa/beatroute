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

/**
 * Dane potrzebne do powiązania wyników ReccoBeats ze Spotify.
 * Pozostałe metadane wyszukiwarki (np. trackTitle) nie są używane przez serwis.
 * @property id - Wewnętrzny identyfikator ReccoBeats do odczytu pomiarów.
 * @property href - Odnośnik Spotify pozwalający przypisać wynik do żądanego ID.
 */
type ReccoBeatsTrackApiResponse = {
  id: string;
  href: string;
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

export type {
  ReccoBeatsAudioFeatures,
  ReccoBeatsTrackApiResponse,
  ReccoBeatsTracksApiResponse,
};
