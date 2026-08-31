import type { MusicMapFeatureKey } from "./types.js";

/**
 * Cechy audio wykorzystywane do budowania wektorów, klasteryzacji i analizy PCA.
 * Kolejność elementów wyznacza kolejność wartości w każdym wektorze utworu.
 */
const MUSIC_MAP_FEATURE_KEYS: MusicMapFeatureKey[] = [
  "acousticness",
  "danceability",
  "energy",
  "instrumentalness",
  "liveness",
  "speechiness",
  "valence",
  "loudness",
  "tempo",
  "key",
  "mode",
];

export { MUSIC_MAP_FEATURE_KEYS };
