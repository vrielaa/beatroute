/** Okres historii odsłuchów wykorzystywany do budowania mapy muzycznej. */
type MusicMapTimeRange = "short_term" | "medium_term" | "long_term";

/** Nazwa cechy audio uwzględnianej w analizie utworów. */
type MusicMapFeatureKey =
  | "acousticness"
  | "danceability"
  | "energy"
  | "instrumentalness"
  | "liveness"
  | "speechiness"
  | "valence"
  | "loudness"
  | "tempo"
  | "key"
  | "mode";

/** Kompletny zestaw liczbowych cech audio jednego utworu lub klastra. */
type AudioFeatureValues = Record<MusicMapFeatureKey, number>;

/**
 * Znormalizowane dane utworu potrzebne do zbudowania mapy muzycznej.
 *
 * @example
 * {
 *   id: "spotify-track-id",
 *   name: "Midnight City",
 *   artists: ["M83"],
 *   album: "Hurry Up, We're Dreaming",
 *   imageUrl: "https://example.com/cover.jpg",
 *   spotifyUrl: "https://open.spotify.com/track/spotify-track-id"
 * }
 */
type MusicMapTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

/** Cechy znalezione dla utworu, które wymagają sprawdzenia kompletności. */
type FoundTrackAudioFeatures = {
  status: "found";
  trackId: string;
  features: Partial<Record<MusicMapFeatureKey, number | null>>;
};

/** Informacja o nieudanym pobraniu cech audio wskazanego utworu. */
type FailedTrackAudioFeaturesLookup = {
  status: "failed";
  trackId: string;
  reason: string;
};

/**
 * Wynik wyszukania cech audio jednego utworu.
 *
 * @example Znalezione cechy wymagające sprawdzenia kompletności
 * {
 *   status: "found",
 *   trackId: "spotify-track-id",
 *   features: { energy: 0.8, tempo: 125 }
 * }
 *
 * @example Nieudane pobranie cech
 * {
 *   status: "failed",
 *   trackId: "spotify-track-id",
 *   reason: "Track not found"
 * }
 */
type TrackAudioFeaturesLookup =
  FoundTrackAudioFeatures | FailedTrackAudioFeaturesLookup;

/** Metadane opisujące zakres danych źródłowych użytych w analizie. */
type MusicMapMetadata = {
  timeRange: MusicMapTimeRange;
  requestedLimit: number;
  spotifyReturnedTracksCount: number;
  spotifyTotalTracksCount: number;
};

/** Utwór posiadający kompletny wektor i opis cech audio. */
type AnalyzableMusicMapTrack = MusicMapTrack & {
  vector: number[];
  audioFeatures: AudioFeatureValues;
  description: string;
};

/** Utwór pominięty w analizie wraz z przyczyną pominięcia. */
type SkippedMusicMapTrack = MusicMapTrack & {
  reason: string;
};

/**
 * Współrzędna punktu otrzymana w wyniku analizy PCA.
 *
 * @example
 * [0.42, -0.18]
 */
type PcaCoordinate = [number, number];

/** Sposób wybrania liczby klastrów zastosowanej w analizie. */
type MusicMapClusterSelectionSource =
  "silhouette-score" | "manual" | "fallback";

/**
 * Ocena jakości jednej rozważanej liczby klastrów.
 *
 * @example
 * { k: 3, inertia: 12.84, silhouetteScore: 0.61 }
 */
type ClusterCandidateEvaluation = {
  k: number;
  inertia: number;
  silhouetteScore: number;
};

/** Wynik klasteryzacji i analizy PCA wektorów cech audio. */
type MusicMapAnalysis = {
  activeFeatureKeys: MusicMapFeatureKey[];
  selectedClusterCount: number;
  selectedClusterCountSource: MusicMapClusterSelectionSource;
  candidateClusterResults: ClusterCandidateEvaluation[];
  clusterLabels: number[];
  pcaCoordinates: PcaCoordinate[];
  explainedVariance: number[];
};

/** Podsumowanie jednego klastra utworów. */
type MusicMapCluster = {
  id: number;
  label: string;
  description: string;
  averageAudioFeatures: AudioFeatureValues;
  tracksCount: number;
  trackIds: string[];
};

/** Punkt reprezentujący utwór na dwuwymiarowej mapie muzycznej. */
type MusicMapPoint = MusicMapTrack & {
  description: string;
  clusterDescription: string;
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  cluster: number;
  audioFeatures: AudioFeatureValues;
};

/** Znormalizowany zbiór danych przeznaczony do analizy mapy muzycznej. */
type MusicMapDataset = {
  tracks: MusicMapTrack[];
  audioFeatures: TrackAudioFeaturesLookup[];
  metadata: MusicMapMetadata;
};

/** Pełna odpowiedź mapy muzycznej zwracana przez aplikację. */
type MusicMapResult = MusicMapMetadata & {
  source: "spotify-top-tracks-reccobeats-audio-features";
  requestedClusterCount: number | null;
  selectedClusterCount: number;
  selectedClusterCountSource: MusicMapClusterSelectionSource;
  appliedClusterCount: number;
  candidateClusterResults: ClusterCandidateEvaluation[];
  featureKeys: MusicMapFeatureKey[];
  activeFeatureKeys: MusicMapFeatureKey[];
  explainedVariance: number[];
  tracksWithAudioFeaturesCount: number;
  skippedTracksCount: number;
  clusters: MusicMapCluster[];
  points: MusicMapPoint[];
  skippedTracks: SkippedMusicMapTrack[];
};

/**
 * Parametry analizy wybierane przez użytkownika.
 *
 * @example
 * { limit: 40, timeRange: "long_term", clusterCount: 4 }
 */
type MusicMapSelection = {
  limit: number;
  timeRange: MusicMapTimeRange;
  clusterCount: number | null;
};

/** Dane wymagane do zbudowania mapy dla zalogowanego użytkownika. */
type MusicMapRequest = MusicMapSelection & {
  accessToken: string;
};

export type {
  MusicMapFeatureKey,
  AudioFeatureValues,
  MusicMapTrack,
  TrackAudioFeaturesLookup,
  AnalyzableMusicMapTrack,
  SkippedMusicMapTrack,
  PcaCoordinate,
  ClusterCandidateEvaluation,
  MusicMapAnalysis,
  MusicMapCluster,
  MusicMapPoint,
  MusicMapDataset,
  MusicMapResult,
  MusicMapSelection,
  MusicMapRequest,
};
