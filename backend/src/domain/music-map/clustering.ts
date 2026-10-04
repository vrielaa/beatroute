import { kmeans } from "ml-kmeans";
import {
  average,
  euclideanDistance,
  round,
  squaredEuclideanDistance,
} from "./math.js";
import type { ClusterCandidateEvaluation, FeatureMatrix } from "./types.js";

const DEFAULT_KMEANS_SEED = 42;
const MAX_AUTO_CLUSTER_COUNT = 8;

type KMeansResult = {
  clusters: number[];
  centroids: number[][];
};

type ClusterSelection = {
  candidateClusterResults: ClusterCandidateEvaluation[];
  maxSupportedClusterCount: number;
  requestedClusterCount: number | null;
};

/** Sprawdza poprawność ręcznie wybranej liczby klastrów. */
function validateRequestedClusterCount(
  requestedClusterCount: number | null
): void {
  if (
    requestedClusterCount !== null &&
    (!Number.isInteger(requestedClusterCount) || requestedClusterCount < 2)
  ) {
    throw new RangeError(
      "Requested cluster count must be an integer of at least 2"
    );
  }
}

/** Ocenia obsługiwane liczby klastrów za pomocą inertia i silhouette score. */
function evaluateClusterCandidates(
  matrix: FeatureMatrix
): ClusterCandidateEvaluation[] {
  const maxClusterCount = getMaxSupportedClusterCount(matrix);

  if (maxClusterCount < 2) {
    return [];
  }

  return Array.from({ length: maxClusterCount - 1 }, (_, index) => {
    const clusterCount = index + 2;
    const result = kmeans(matrix, clusterCount, {
      seed: DEFAULT_KMEANS_SEED,
    });

    return {
      k: clusterCount,
      inertia: round(calculateInertia(matrix, result), 4),
      silhouetteScore: round(
        calculateSilhouetteScore(matrix, result.clusters),
        4
      ),
    };
  });
}

/** Wybiera żądaną liczbę klastrów albo najlepszy silhouette score. */
function selectClusterCount({
  candidateClusterResults,
  maxSupportedClusterCount,
  requestedClusterCount,
}: ClusterSelection): number {
  if (requestedClusterCount) {
    return Math.min(requestedClusterCount, maxSupportedClusterCount);
  }

  if (!candidateClusterResults.length) {
    return 1;
  }

  return candidateClusterResults.reduce((bestResult, result) => {
    if (result.silhouetteScore > bestResult.silhouetteScore) {
      return result;
    }

    if (
      result.silhouetteScore === bestResult.silhouetteScore &&
      result.k < bestResult.k
    ) {
      return result;
    }

    return bestResult;
  }).k;
}

/** Wyznacza maksymalną liczbę klastrów obsługiwaną przez dany zbiór. */
function getMaxSupportedClusterCount(matrix: FeatureMatrix): number {
  return Math.min(
    MAX_AUTO_CLUSTER_COUNT,
    matrix.length - 1,
    getUniqueRowsCount(matrix)
  );
}

/** Przypisuje próbki do klastrów za pomocą deterministycznego K-means. */
function clusterFeatureMatrix(
  matrix: FeatureMatrix,
  clusterCount: number
): number[] {
  if (clusterCount < 2) {
    return matrix.map(() => 0);
  }

  return kmeans(matrix, clusterCount, {
    seed: DEFAULT_KMEANS_SEED,
  }).clusters;
}

/** Oblicza sumę kwadratów odległości próbek od centroidów ich klastrów. */
function calculateInertia(matrix: FeatureMatrix, result: KMeansResult): number {
  return matrix.reduce((sum, row, index) => {
    const centroid = result.centroids[result.clusters[index]];

    return sum + squaredEuclideanDistance(row, centroid);
  }, 0);
}

/** Oblicza średni silhouette score całego podziału. */
function calculateSilhouetteScore(
  matrix: FeatureMatrix,
  clusterLabels: number[]
): number {
  const uniqueClusters = [...new Set(clusterLabels)];

  if (uniqueClusters.length < 2) {
    return 0;
  }

  const scores = matrix.map((row, index) => {
    const ownCluster = clusterLabels[index];
    const ownClusterRows = matrix.filter(
      (_, rowIndex) =>
        clusterLabels[rowIndex] === ownCluster && rowIndex !== index
    );

    if (!ownClusterRows.length) {
      return 0;
    }

    const ownClusterDistance = average(
      ownClusterRows.map((otherRow) => euclideanDistance(row, otherRow))
    );
    const nearestOtherClusterDistance = Math.min(
      ...uniqueClusters
        .filter((cluster) => cluster !== ownCluster)
        .map((cluster) => {
          const clusterRows = matrix.filter(
            (_, rowIndex) => clusterLabels[rowIndex] === cluster
          );

          return average(
            clusterRows.map((otherRow) => euclideanDistance(row, otherRow))
          );
        })
    );
    const denominator = Math.max(
      ownClusterDistance,
      nearestOtherClusterDistance
    );

    return denominator === 0
      ? 0
      : (nearestOtherClusterDistance - ownClusterDistance) / denominator;
  });

  return average(scores);
}

/** Liczy unikalne wektory po zaokrągleniu wartości do ośmiu miejsc. */
function getUniqueRowsCount(matrix: FeatureMatrix): number {
  return new Set(
    matrix.map((row) => row.map((value) => round(value, 8)).join(":"))
  ).size;
}

export {
  validateRequestedClusterCount,
  evaluateClusterCandidates,
  selectClusterCount,
  getMaxSupportedClusterCount,
  clusterFeatureMatrix,
};
