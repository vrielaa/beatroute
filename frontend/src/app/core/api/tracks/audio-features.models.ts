type AudioFeatures = {
  id?: string;
  spotifyId?: string;
  uuid?: string;
  acousticness?: number | null;
  danceability?: number | null;
  energy?: number | null;
  instrumentalness?: number | null;
  key?: number | null;
  liveness?: number | null;
  loudness?: number | null;
  mode?: number | null;
  speechiness?: number | null;
  tempo?: number | null;
  timeSignature?: number | null;
  valence?: number | null;
  error?: string;
};

type MultipleAudioFeaturesResponse = {
  audio_features: AudioFeatures[];
};

/**
 * Liczby dostępnych pomiarów użytych do obliczenia udziałów procentowych.
 *
 * @property mode - Liczba utworów z rozpoznanym trybem durowym lub molowym.
 * @property liveness - Liczba utworów z pomiarem prawdopodobieństwa wykonania na żywo.
 * @property instrumentalness - Liczba utworów z pomiarem udziału partii instrumentalnych.
 * @property speechiness - Liczba utworów z pomiarem udziału mowy.
 */
type AudioMeasurementCounts = {
  mode: number;
  liveness: number;
  instrumentalness: number;
  speechiness: number;
};

/**
 * Statystyki cech audio i kompletność danych źródłowych.
 * Udziały procentowe są liczone wśród dostępnych pomiarów danej cechy;
 * `null` oznacza brak pomiarów, a 0% oznacza brak dopasowań w istniejących pomiarach.
 */
type AudioStats = {
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
  majorPercentage: number | null;
  minorPercentage: number | null;
  dominantTimeSignature: number | null;
  liveTrackPercentage: number | null;
  instrumentalTrackPercentage: number | null;
  speechHeavyTrackPercentage: number | null;
  measurementCounts: AudioMeasurementCounts;
  foundTracksCount: number;
  totalTracksCount: number;
};

type TrackAnalysisResponse = {
  stats: AudioStats;
  audioFeatures: AudioFeatures[];
};

export type {
  AudioFeatures,
  MultipleAudioFeaturesResponse,
  AudioStats,
  AudioMeasurementCounts,
  TrackAnalysisResponse,
};
