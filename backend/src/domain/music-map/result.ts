import { analyzeFeatureVectors } from "./analysis.js";
import { buildClusterSummaries, getAppliedClusterCount } from "./clusters.js";
import { MUSIC_MAP_FEATURE_KEYS } from "./features.js";
import { round, scaleNumberToRange } from "./math.js";
import { prepareMusicMapTracks } from "./tracks.js";

import type {
  AnalyzableMusicMapTrack,
  MusicMapAnalysis,
  MusicMapCluster,
  MusicMapDataset,
  MusicMapPoint,
  MusicMapResult,
  PcaCoordinate,
} from "./types.js";

/** Współrzędna przeskalowana do przestrzeni wizualizacji. */
type DisplayCoordinate = { x: number; y: number };

/**
 * Przekształca pobrane utwory i cechy audio w klastry oraz punkty mapy.
 * Funkcja nie pobiera danych z zewnętrznych API.
 *
 * @param dataset - Utwory, ich cechy audio i metadane zakresu analizy.
 * @param requestedClusterCount - Liczba klastrów wybrana przez użytkownika.
 * @returns Wynik analizy gotowy do zwrócenia przez API.
 */
function buildMusicMapResult(
  dataset: MusicMapDataset,
  requestedClusterCount: number | null = null
): MusicMapResult {
  const { tracks, audioFeatures, metadata } = dataset;
  const { analyzableTracks, skippedTracks } = prepareMusicMapTracks(
    tracks,
    audioFeatures
  );

  const featureVectors = analyzableTracks.map((track) => track.vector);
  const analysis = analyzeFeatureVectors(
    featureVectors,
    MUSIC_MAP_FEATURE_KEYS,
    requestedClusterCount
  );

  const displayCoordinates = scalePcaCoordinatesForDisplay(
    analysis.pcaCoordinates
  );
  const clusters = buildClusterSummaries(
    analyzableTracks,
    analysis.clusterLabels
  );
  const points = buildMusicMapPoints(
    analyzableTracks,
    analysis,
    displayCoordinates,
    clusters
  );

  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    ...metadata,
    requestedClusterCount,
    selectedClusterCount: analysis.selectedClusterCount,
    selectedClusterCountSource: analysis.selectedClusterCountSource,
    appliedClusterCount: getAppliedClusterCount(analysis.clusterLabels),
    candidateClusterResults: analysis.candidateClusterResults,
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    activeFeatureKeys: analysis.activeFeatureKeys,
    explainedVariance: analysis.explainedVariance,
    tracksWithAudioFeaturesCount: analyzableTracks.length,
    skippedTracksCount: skippedTracks.length,
    clusters,
    points,
    skippedTracks,
  };
}

/**
 * Skaluje osobno obie osie PCA do zakresu od -1 do 1.
 * Pusta lista pozostaje pusta, a oś bez rozpiętości przyjmuje wartość zero.
 *
 * @param pcaCoordinates - Surowe współrzędne otrzymane z PCA.
 * @returns Współrzędne gotowe do rozmieszczenia punktów na wykresie.
 */
function scalePcaCoordinatesForDisplay(
  pcaCoordinates: PcaCoordinate[]
): DisplayCoordinate[] {
  if (!pcaCoordinates.length) {
    return [];
  }

  const xValues = pcaCoordinates.map(([x]) => x);
  const yValues = pcaCoordinates.map(([, y]) => y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  return pcaCoordinates.map(([x, y]) => ({
    x: round(scaleNumberToRange(x, xMin, xMax, -1, 1)),
    y: round(scaleNumberToRange(y, yMin, yMax, -1, 1)),
  }));
}

/**
 * Łączy wynik PCA i klasteryzacji z informacjami o utworach.
 *
 * @param tracks - Utwory posiadające kompletne cechy audio.
 * @param analysis - Wynik klasteryzacji i analizy PCA.
 * @param displayCoordinates - Współrzędne przeskalowane dla wykresu.
 * @param clusters - Podsumowania utworzonych klastrów.
 * @returns Punkty przeznaczone do wyświetlenia na wykresie.
 */
function buildMusicMapPoints(
  tracks: AnalyzableMusicMapTrack[],
  analysis: MusicMapAnalysis,
  displayCoordinates: DisplayCoordinate[],
  clusters: MusicMapCluster[]
): MusicMapPoint[] {
  const clusterDescriptionsById = new Map<number, string>(
    clusters.map((cluster) => [cluster.id, cluster.description])
  );

  return tracks.map((track, index) => {
    const cluster = analysis.clusterLabels[index] ?? 0;
    const displayCoordinate = displayCoordinates[index] ?? { x: 0, y: 0 };
    const [rawX = 0, rawY = 0] = analysis.pcaCoordinates[index] ?? [];

    return {
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: track.album,
      imageUrl: track.imageUrl,
      spotifyUrl: track.spotifyUrl,
      description: track.description,
      clusterDescription: clusterDescriptionsById.get(cluster) ?? "",
      x: displayCoordinate.x,
      y: displayCoordinate.y,
      rawX: round(rawX),
      rawY: round(rawY),
      cluster,
      audioFeatures: track.audioFeatures,
    };
  });
}

export { buildMusicMapResult };
