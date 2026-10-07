/** Znormalizowane cechy audio pojedynczego utworu, niezależne od dostawcy danych. */
type TrackAudioFeatures = {
  /** Identyfikator utworu w źródle cech audio. */
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
type TrackAudioFeaturesFailure = {
  /** Identyfikator utworu Spotify, którego dotyczy błąd. */
  spotifyId: string;
  /** Czytelny opis niepowodzenia pobierania danych. */
  error: string;
};

/** Wynik odczytu cech jednego utworu: dane albo opis błędu. */
type TrackAudioFeaturesResult = TrackAudioFeatures | TrackAudioFeaturesFailure;

/**
 * Liczby dostępnych pomiarów stanowiących podstawę udziałów procentowych.
 * Brak pomiaru oraz nieudane pobranie cech utworu nie zwiększają liczników.
 *
 * @property mode - Liczba utworów z rozpoznanym trybem durowym lub molowym.
 * @property liveness - Liczba utworów z pomiarem prawdopodobieństwa wykonania na żywo.
 * @property instrumentalness - Liczba utworów z pomiarem udziału partii instrumentalnych.
 * @property speechiness - Liczba utworów z pomiarem udziału mowy.
 */
type TrackAudioMeasurementCounts = {
  mode: number;
  liveness: number;
  instrumentalness: number;
  speechiness: number;
};

/**
 * Zbiorcze statystyki cech audio. Brak pomiarów oznacza `null`, a nie zero.
 * Udziały procentowe odnoszą się do dostępnych pomiarów danej cechy.
 *
 * @property trackCount - Liczba utworów, dla których odczytano dane cech audio.
 * @property averageBpm - Średnie tempo w uderzeniach na minutę.
 * @property averageEnergy - Średnia energia utworów.
 * @property averageDanceability - Średnia przydatność utworów do tańca.
 * @property averageValence - Średnia pozytywność brzmienia.
 * @property averageAcousticness - Średni udział brzmienia akustycznego.
 * @property averageInstrumentalness - Średni udział partii instrumentalnych.
 * @property averageLiveness - Średnie prawdopodobieństwo wykonania na żywo.
 * @property averageSpeechiness - Średni udział mowy w nagraniach.
 * @property averageLoudness - Średnia głośność utworów w decybelach.
 * @property dominantKey - Najczęściej występująca tonacja.
 * @property dominantMode - Najczęściej występujący tryb harmoniczny.
 * @property dominantTimeSignature - Najczęściej występujące metrum.
 * @property majorPercentage - Procent utworów durowych wśród rozpoznanych trybów.
 * @property minorPercentage - Procent utworów molowych wśród rozpoznanych trybów.
 * @property liveTrackPercentage - Procent pomiarów liveness przekraczających 0,8.
 * @property instrumentalTrackPercentage - Procent pomiarów instrumentalness przekraczających 0,5.
 * @property speechHeavyTrackPercentage - Procent pomiarów speechiness przekraczających 0,66.
 * @property measurementCounts - Liczby pomiarów użytych do obliczenia procentów.
 */
type TrackAudioStats = {
  trackCount: number;
  averageBpm: number | null;
  averageEnergy: number | null;
  averageDanceability: number | null;
  averageValence: number | null;
  averageAcousticness: number | null;
  averageInstrumentalness: number | null;
  averageLiveness: number | null;
  averageSpeechiness: number | null;
  averageLoudness: number | null;
  dominantKey: number | null;
  dominantMode: number | null;
  dominantTimeSignature: number | null;
  majorPercentage: number | null;
  minorPercentage: number | null;
  liveTrackPercentage: number | null;
  instrumentalTrackPercentage: number | null;
  speechHeavyTrackPercentage: number | null;
  measurementCounts: TrackAudioMeasurementCounts;
};

export type {
  TrackAudioFeatures,
  TrackAudioFeaturesFailure,
  TrackAudioFeaturesResult,
  TrackAudioStats,
  TrackAudioMeasurementCounts,
};
