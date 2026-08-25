import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";

const DEFAULT_KMEANS_SEED = 42;
const MAX_AUTO_CLUSTER_COUNT = 8;

export function analyzeMusicMapRows({
  rows,
  featureKeys,
  requestedClusterCount,
}) {
  const activeFeatureIndexes = getVariableFeatureIndexes(rows, featureKeys);
  const activeFeatureKeys = activeFeatureIndexes.map(
    (index) => featureKeys[index]
  );

  if (rows.length < 2 || !activeFeatureIndexes.length) {
    return buildFallbackAnalysis(rows, activeFeatureKeys);
  }

  const rawMatrix = rows.map((row) =>
    activeFeatureIndexes.map((index) => row.vector[index])
  );
  const scaledMatrix = standardizeMatrix(rawMatrix);
  const candidateClusterResults = evaluateClusterCandidates(scaledMatrix);
  const maxSupportedClusterCount = getMaxSupportedClusterCount(scaledMatrix);
  const selectedClusterCount = selectClusterCount({
    candidateClusterResults,
    maxSupportedClusterCount,
    requestedClusterCount,
  });
  const selectedClusterCountSource = requestedClusterCount
    ? "manual"
    : candidateClusterResults.length
    ? "silhouette-score"
    : "fallback";
  const clusterLabels = clusterMatrix(scaledMatrix, selectedClusterCount);
  const projection = projectScaledMatrix(scaledMatrix);

  return {
    activeFeatureKeys,
    selectedClusterCount,
    selectedClusterCountSource,
    candidateClusterResults,
    clusterLabels,
    coordinates: projection.coordinates,
    explainedVariance: projection.explainedVariance,
  };
}

function buildFallbackAnalysis(rows, activeFeatureKeys) {
  return {
    activeFeatureKeys,
    selectedClusterCount: rows.length ? 1 : 0,
    selectedClusterCountSource: "fallback",
    candidateClusterResults: [],
    clusterLabels: rows.map(() => 0),
    coordinates: rows.map(() => [0, 0]),
    explainedVariance: [],
  };
}

function getVariableFeatureIndexes(rows, featureKeys) {
  if (rows.length < 2) {
    return [];
  }

  return featureKeys.flatMap((_, featureIndex) => {
    const values = rows.map((row) => row.vector[featureIndex]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return min === max ? [] : [featureIndex];
  });
}

function standardizeMatrix(matrix) {
  const columnsCount = matrix[0]?.length ?? 0;
  const means = Array.from({ length: columnsCount }, (_, columnIndex) =>
    average(matrix.map((row) => row[columnIndex]))
  );
  const standardDeviations = Array.from(
    { length: columnsCount },
    (_, columnIndex) => {
      const values = matrix.map((row) => row[columnIndex]);
      const mean = means[columnIndex];
      const variance = average(values.map((value) => (value - mean) ** 2));

      return Math.sqrt(variance) || 1;
    }
  );

  return matrix.map((row) =>
    row.map(
      (value, columnIndex) =>
        (value - means[columnIndex]) / standardDeviations[columnIndex]
    )
  );
}

function evaluateClusterCandidates(matrix) {
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

function selectClusterCount({
  candidateClusterResults,
  maxSupportedClusterCount,
  requestedClusterCount,
}) {
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

function getMaxSupportedClusterCount(matrix) {
  return Math.min(
    MAX_AUTO_CLUSTER_COUNT,
    matrix.length - 1,
    getUniqueRowsCount(matrix)
  );
}

function clusterMatrix(matrix, clusterCount) {
  if (clusterCount < 2) {
    return matrix.map(() => 0);
  }

  return kmeans(matrix, clusterCount, {
    seed: DEFAULT_KMEANS_SEED,
  }).clusters;
}

function projectScaledMatrix(matrix) {
  if (matrix.length < 2 || !matrix[0]?.length) {
    return {
      coordinates: matrix.map(() => [0, 0]),
      explainedVariance: [],
    };
  }

  if (matrix[0].length === 1) {
    return projectSingleFeature(matrix);
  }

  const pca = new PCA(matrix, { center: false, scale: false });

  return {
    coordinates: pca.predict(matrix, { nComponents: 2 }).to2DArray(),
    explainedVariance: pca
      .getExplainedVariance()
      .slice(0, 2)
      .map((value) => round(value, 4)),
  };
}

function projectSingleFeature(matrix) {
  const values = matrix.map((row) => row[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return {
    coordinates: values.map((value) => [((value - min) / spread) * 2 - 1, 0]),
    explainedVariance: [1],
  };
}

function calculateInertia(matrix, result) {
  return matrix.reduce((sum, row, index) => {
    const centroid = result.centroids[result.clusters[index]];

    return sum + squaredEuclideanDistance(row, centroid);
  }, 0);
}

function calculateSilhouetteScore(matrix, clusterLabels) {
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

function getUniqueRowsCount(matrix) {
  return new Set(
    matrix.map((row) => row.map((value) => round(value, 8)).join(":"))
  ).size;
}

function squaredEuclideanDistance(left, right) {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0
  );
}

function euclideanDistance(left, right) {
  return Math.sqrt(squaredEuclideanDistance(left, right));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
