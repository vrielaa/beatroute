import {
  clusterFeatureMatrix,
  evaluateClusterCandidates,
  getMaxSupportedClusterCount,
  selectClusterCount,
  validateRequestedClusterCount,
} from "./clustering.js";
import {
  selectVariableFeatures,
  standardizeFeatureMatrix,
  validateFeatureMatrix,
} from "./feature-matrix.js";
import { calculatePca } from "./pca.js";
import type {
  FeatureMatrix,
  MusicMapAnalysis,
  MusicMapFeatureKey,
  PcaCoordinate,
} from "./types.js";

/**
 * Analizuje wektory cech audio: usuwa stałe wymiary, standaryzuje dane,
 * dobiera liczbę klastrów, wykonuje K-means i wyznacza współrzędne PCA.
 *
 * @param featureVectors - Wektory cech audio analizowanych utworów.
 * @param featureKeys - Nazwy kolejnych wymiarów każdego wektora.
 * @param requestedClusterCount - Ręcznie wybrana liczba klastrów lub `null`.
 * @returns Wynik klasteryzacji i dwuwymiarowej analizy PCA.
 */
function analyzeFeatureVectors(
  featureVectors: FeatureMatrix,
  featureKeys: MusicMapFeatureKey[],
  requestedClusterCount: number | null
): MusicMapAnalysis {
  validateFeatureMatrix(featureVectors, featureKeys);
  validateRequestedClusterCount(requestedClusterCount);

  const { activeFeatureKeys, matrix } = selectVariableFeatures(
    featureVectors,
    featureKeys
  );

  if (featureVectors.length < 2 || !activeFeatureKeys.length) {
    return buildFallbackAnalysis(featureVectors, activeFeatureKeys);
  }

  const standardizedMatrix = standardizeFeatureMatrix(matrix);
  const candidateClusterResults = evaluateClusterCandidates(standardizedMatrix);
  const selectedClusterCount = selectClusterCount({
    candidateClusterResults,
    maxSupportedClusterCount: getMaxSupportedClusterCount(standardizedMatrix),
    requestedClusterCount,
  });
  const pcaResult = calculatePca(standardizedMatrix);

  return {
    activeFeatureKeys,
    selectedClusterCount,
    selectedClusterCountSource: requestedClusterCount
      ? "manual"
      : candidateClusterResults.length
        ? "silhouette-score"
        : "fallback",
    candidateClusterResults,
    clusterLabels: clusterFeatureMatrix(
      standardizedMatrix,
      selectedClusterCount
    ),
    pcaCoordinates: pcaResult.coordinates,
    explainedVariance: pcaResult.explainedVariance,
  };
}

/** Tworzy bezpieczny wynik dla pustego lub niemożliwego do analizy zbioru. */
function buildFallbackAnalysis(
  featureVectors: FeatureMatrix,
  activeFeatureKeys: MusicMapFeatureKey[]
): MusicMapAnalysis {
  return {
    activeFeatureKeys,
    selectedClusterCount: featureVectors.length ? 1 : 0,
    selectedClusterCountSource: "fallback",
    candidateClusterResults: [],
    clusterLabels: featureVectors.map(() => 0),
    pcaCoordinates: featureVectors.map((): PcaCoordinate => [0, 0]),
    explainedVariance: [],
  };
}

export { analyzeFeatureVectors };
