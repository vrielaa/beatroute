/** Znormalizowane cechy audio pojedynczego utworu. */
type TrackAudioFeatures = {
  id: string;
  spotifyId: string;
  acousticness: number | null;
  danceability: number | null;
  energy: number | null;
  instrumentalness: number | null;
  key: number | null;
  liveness: number | null;
  loudness: number | null;
  mode: number | null;
  speechiness: number | null;
  tempo: number | null;
  timeSignature: number | null;
  valence: number | null;
};

/** Informacja o nieudanym pobraniu cech jednego utworu. */
type TrackAudioFeaturesFailure = {
  spotifyId: string;
  error: string;
};

/** Wynik pobierania cech: dane utworu albo opis błędu. */
type TrackAudioFeaturesResult = TrackAudioFeatures | TrackAudioFeaturesFailure;

/** Zbiorcze statystyki obliczone na podstawie cech audio utworów. */
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
  majorPercentage: number;
  minorPercentage: number;
  liveTrackPercentage: number;
  instrumentalTrackPercentage: number;
  speechHeavyTrackPercentage: number;
};

/** Statystyki rozszerzone o kompletność danych źródłowych. */
type TrackAudioStatsSummary = TrackAudioStats & {
  totalTracksCount: number;
  foundTracksCount: number;
};

export type {
  TrackAudioFeatures,
  TrackAudioFeaturesFailure,
  TrackAudioFeaturesResult,
  TrackAudioStats,
  TrackAudioStatsSummary,
};
