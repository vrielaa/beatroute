/** Surowe, opcjonalne cechy audio zwracane przez API ReccoBeats. */
export type ReccoBeatsAudioFeatures = {
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

/** Cechy audio znalezione dla utworu i powiązane z jego identyfikatorami. */
export type ReccoBeatsTrackAudioFeatures = {
  /** Wewnętrzny identyfikator utworu ReccoBeats. */
  id: string;
  /** Identyfikator odpowiadającego utworu Spotify. */
  spotifyId: string;
  /** Udział brzmienia akustycznego w skali od 0 do 1. */
  acousticness: number | null;
  /** Przydatność utworu do tańca w skali od 0 do 1. */
  danceability: number | null;
  /** Energia utworu w skali od 0 do 1. */
  energy: number | null;
  /** Udział partii instrumentalnych w skali od 0 do 1. */
  instrumentalness: number | null;
  /** Tonacja zapisana jako numer klasy wysokości dźwięku. */
  key: number | null;
  /** Prawdopodobieństwo wykonania na żywo w skali od 0 do 1. */
  liveness: number | null;
  /** Średnia głośność wyrażona w decybelach. */
  loudness: number | null;
  /** Tryb harmoniczny: molowy (`0`) albo durowy (`1`). */
  mode: number | null;
  /** Udział mowy w nagraniu w skali od 0 do 1. */
  speechiness: number | null;
  /** Tempo utworu wyrażone w uderzeniach na minutę. */
  tempo: number | null;
  /** Metrum utworu, na przykład `4` dla metrum 4/4. */
  timeSignature: number | null;
  /** Pozytywność brzmienia w skali od 0 do 1. */
  valence: number | null;
};

/** Informacja o utworze, dla którego nie udało się pobrać cech audio. */
export type ReccoBeatsTrackAudioFeaturesError = {
  /** Identyfikator utworu Spotify, którego dotyczy błąd. */
  spotifyId: string;
  /** Czytelny opis niepowodzenia pobierania danych. */
  error: string;
};

/** Wynik pobierania cech audio jednego utworu. */
export type ReccoBeatsTrackAudioFeaturesResult =
  ReccoBeatsTrackAudioFeatures | ReccoBeatsTrackAudioFeaturesError;

/** Skrócone dane utworu zwracane przez wyszukiwarkę ReccoBeats. */
export type ReccoBeatsTrackApiResponse = {
  /** Wewnętrzny identyfikator utworu ReccoBeats. */
  id: string;
  /** Odnośnik pozwalający powiązać wynik z utworem Spotify. */
  href: string;
  /** Nazwa utworu. */
  name: string;
};

/** Obsługiwane warianty odpowiedzi endpointu wyszukiwania utworów. */
export type ReccoBeatsTracksApiResponse =
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

/** Zbiorcze statystyki obliczone na podstawie cech audio utworów. */
export type AudioStats = {
  /** Liczba utworów uwzględnionych w obliczeniach. */
  trackCount: number;
  /** Średnie tempo w uderzeniach na minutę. */
  averageBpm: number | null;
  /** Średnia energia utworów. */
  averageEnergy: number | null;
  /** Średnia przydatność utworów do tańca. */
  averageDanceability: number | null;
  /** Średnia pozytywność brzmienia. */
  averageValence: number | null;
  /** Średni udział brzmienia akustycznego. */
  averageAcousticness: number | null;
  /** Średni udział partii instrumentalnych. */
  averageInstrumentalness: number | null;
  /** Średnie prawdopodobieństwo wykonania na żywo. */
  averageLiveness: number | null;
  /** Średni udział mowy w nagraniach. */
  averageSpeechiness: number | null;
  /** Średnia głośność utworów w decybelach. */
  averageLoudness: number | null;
  /** Najczęściej występująca tonacja. */
  dominantKey: number | null;
  /** Najczęściej występujący tryb harmoniczny. */
  dominantMode: number | null;
  /** Najczęściej występujące metrum. */
  dominantTimeSignature: number | null;
  /** Procent utworów w trybie durowym. */
  majorPercentage: number;
  /** Procent utworów w trybie molowym. */
  minorPercentage: number;
  /** Procent utworów zaklasyfikowanych jako nagrania na żywo. */
  liveTrackPercentage: number;
  /** Procent utworów zaklasyfikowanych jako instrumentalne. */
  instrumentalTrackPercentage: number;
  /** Procent utworów o wysokim udziale mowy. */
  speechHeavyTrackPercentage: number;
};
