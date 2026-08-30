import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";
import type {
  ClusteringResult,
  Coordinate,
  MusicMapAnalysis,
  MusicMapCandidateClusterResult,
  MusicMapCoordinates,
  MusicMapFeatureKey,
  NumericMatrix,
} from "./music-map.types.js";

const DEFAULT_KMEANS_SEED = 42;
const MAX_AUTO_CLUSTER_COUNT = 8;

/**
 * Analizuje wektory cech audio: usuwa stałe wymiary, standaryzuje dane,
 * dobiera liczbę klastrów, wykonuje K-means i wyznacza projekcję PCA.
 *
 * @param featureVectors - Wektory cech audio analizowanych utworów.
 * @param featureKeys - Nazwy kolejnych wymiarów każdego wektora.
 * @param requestedClusterCount - Ręcznie wybrana liczba klastrów lub `null`.
 * @returns Wynik klasteryzacji i dwuwymiarowej projekcji.
 */
export function analyzeMusicMapRows(
  featureVectors: NumericMatrix,
  featureKeys: MusicMapFeatureKey[],
  requestedClusterCount: number | null
): MusicMapAnalysis {
  validateAnalysisData(featureVectors, featureKeys, requestedClusterCount);

  const activeFeatureIndexes = getVariableFeatureIndexes(
    featureVectors,
    featureKeys
  );

  const activeFeatureKeys = activeFeatureIndexes.map(
    (index) => featureKeys[index]
  );

  if (featureVectors.length < 2 || !activeFeatureIndexes.length) {
    return buildFallbackAnalysis(featureVectors, activeFeatureKeys);
  }

  const rawMatrix = featureVectors.map((vector) =>
    activeFeatureIndexes.map((index) => vector[index])
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

/**
 * Sprawdza spójność danych wejściowych analizy.
 * Brak próbek jest dozwolony, ale istniejące wektory muszą odpowiadać cechom.
 *
 * @throws {RangeError} Gdy liczba wartości nie odpowiada liczbie cech.
 * @throws {TypeError} Gdy wektor zawiera wartość, która nie jest skończoną liczbą.
 */
function validateAnalysisData(
  featureVectors: NumericMatrix,
  featureKeys: MusicMapFeatureKey[],
  requestedClusterCount: number | null
): void {
  for (const [index, vector] of featureVectors.entries()) {
    if (vector.length !== featureKeys.length) {
      throw new RangeError(
        `Feature vector ${index} has ${vector.length} values; expected ${featureKeys.length}`
      );
    }

    if (vector.some((value) => !Number.isFinite(value))) {
      throw new TypeError(
        `Feature vector ${index} contains a non-finite value`
      );
    }
  }

  if (
    requestedClusterCount !== null &&
    (!Number.isInteger(requestedClusterCount) || requestedClusterCount < 2)
  ) {
    throw new RangeError(
      "Requested cluster count must be an integer of at least 2"
    );
  }
}

/**
 * Tworzy bezpieczny wynik dla pustego lub niemożliwego do analizy zbioru.
 *
 * @param featureVectors - Dostępne wektory cech.
 * @param activeFeatureKeys - Cechy, które pozostały aktywne.
 * @returns Analiza z jednym klastrem lub bez klastrów i zerowymi punktami.
 */
function buildFallbackAnalysis(
  featureVectors: NumericMatrix,
  activeFeatureKeys: MusicMapFeatureKey[]
): MusicMapAnalysis {
  return {
    activeFeatureKeys,
    selectedClusterCount: featureVectors.length ? 1 : 0,
    selectedClusterCountSource: "fallback",
    candidateClusterResults: [],
    clusterLabels: featureVectors.map(() => 0),
    coordinates: featureVectors.map((): Coordinate => [0, 0]),
    explainedVariance: [],
  };
}

/**
 * Wskazuje cechy, których wartości różnią się pomiędzy utworami.
 * Stałe cechy nie wnoszą informacji do standaryzacji ani klasteryzacji.
 *
 * @param featureVectors - Wektory cech audio.
 * @param featureKeys - Nazwy wymiarów wektorów.
 * @returns Indeksy cech posiadających co najmniej dwie różne wartości.
 */
function getVariableFeatureIndexes(
  featureVectors: NumericMatrix,
  featureKeys: MusicMapFeatureKey[]
): number[] {
  if (featureVectors.length < 2) {
    return [];
  }

  return featureKeys.flatMap((_, featureIndex) => {
    const values = featureVectors.map((vector) => vector[featureIndex]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return min === max ? [] : [featureIndex];
  });
}

/**
 * Standaryzuje każdą kolumnę macierzy do średniej 0 i odchylenia 1.
 * Zapobiega dominowaniu cech o większej skali, np. tempa nad energią.
 *
 * @param matrix - Macierz, w której wiersze są utworami, a kolumny cechami.
 * @returns Standaryzowana macierz o tych samych wymiarach.
 */
function standardizeMatrix(matrix: NumericMatrix): NumericMatrix {
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

/**
 * Ocenia wszystkie obsługiwane liczby klastrów przy użyciu inertia
 * i silhouette score.
 *
 * @param matrix - Standaryzowana macierz cech.
 * @returns Wyniki jakości dla kolejnych wartości `k`.
 */
function evaluateClusterCandidates(
  matrix: NumericMatrix
): MusicMapCandidateClusterResult[] {
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

/**
 * Wybiera ręcznie żądaną liczbę klastrów albo najlepszy silhouette score.
 * Przy remisie preferuje mniejszą liczbę klastrów.
 *
 * @param selection - Kandydaci, ograniczenie zbioru i wybór użytkownika.
 * @returns Liczba klastrów zastosowana w analizie.
 */
function selectClusterCount({
  candidateClusterResults,
  maxSupportedClusterCount,
  requestedClusterCount,
}: {
  candidateClusterResults: MusicMapCandidateClusterResult[];
  maxSupportedClusterCount: number;
  requestedClusterCount: number | null;
}): number {
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

/**
 * Wyznacza maksymalną sensowną liczbę klastrów dla dostępnych danych.
 * Uwzględnia limit aplikacji, liczbę próbek i liczbę unikalnych wektorów.
 *
 * @param matrix - Standaryzowana macierz cech.
 * @returns Maksymalna obsługiwana liczba klastrów.
 */
function getMaxSupportedClusterCount(matrix: NumericMatrix): number {
  return Math.min(
    MAX_AUTO_CLUSTER_COUNT,
    matrix.length - 1,
    getUniqueRowsCount(matrix)
  );
}

/**
 * Przypisuje każdą próbkę do klastra za pomocą deterministycznego K-means.
 *
 * @param matrix - Standaryzowana macierz cech.
 * @param clusterCount - Liczba klastrów do utworzenia.
 * @returns Etykieta klastra dla każdego wiersza macierzy.
 */
function clusterMatrix(matrix: NumericMatrix, clusterCount: number): number[] {
  if (clusterCount < 2) {
    return matrix.map(() => 0);
  }

  return kmeans(matrix, clusterCount, {
    seed: DEFAULT_KMEANS_SEED,
  }).clusters;
}

/**
 * Redukuje standaryzowane dane do dwóch wymiarów metodą PCA.
 * Dla jednej aktywnej cechy stosuje projekcję jednowymiarową.
 *
 * @param matrix - Standaryzowana macierz cech.
 * @returns Współrzędne punktów i wariancja wyjaśniona przez osie.
 */
function projectScaledMatrix(matrix: NumericMatrix): MusicMapCoordinates {
  if (matrix[0].length === 1) {
    return projectSingleFeature(matrix);
  }

  const pca = new PCA(matrix, { center: false, scale: false });

  return {
    coordinates: pca
      .predict(matrix, { nComponents: 2 })
      .to2DArray()
      .map((row): Coordinate => [row[0] ?? 0, row[1] ?? 0]),
    explainedVariance: pca
      .getExplainedVariance()
      .slice(0, 2)
      .map((value) => round(value, 4)),
  };
}

/**
 * Projektuje jedną aktywną cechę na oś X w zakresie od -1 do 1.
 *
 * @param matrix - Macierz zawierająca jedną kolumnę cech.
 * @returns Jednowymiarowa projekcja zapisana jako współrzędne 2D.
 */
function projectSingleFeature(matrix: NumericMatrix): MusicMapCoordinates {
  const values = matrix.map((row) => row[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return {
    coordinates: values.map((value): Coordinate => [
      ((value - min) / spread) * 2 - 1,
      0,
    ]),
    explainedVariance: [1],
  };
}

/**
 * Oblicza sumę kwadratów odległości próbek od centroidów ich klastrów.
 * Niższa inertia oznacza bardziej zwarte klastry.
 *
 * @param matrix - Macierz analizowanych próbek.
 * @param result - Etykiety i centroidy zwrócone przez K-means.
 * @returns Wartość inertia dla podziału.
 */
function calculateInertia(
  matrix: NumericMatrix,
  result: ClusteringResult
): number {
  return matrix.reduce((sum, row, index) => {
    const centroid = result.centroids[result.clusters[index]];

    return sum + squaredEuclideanDistance(row, centroid);
  }, 0);
}

/**
 * Oblicza średni silhouette score całego podziału.
 * Wynik porównuje spójność próbki z własnym klastrem i najbliższym obcym.
 *
 * @param matrix - Macierz analizowanych próbek.
 * @param clusterLabels - Etykiety klastrów przypisane próbkom.
 * @returns Średni silhouette score albo zero dla niepoprawnego podziału.
 */
function calculateSilhouetteScore(
  matrix: NumericMatrix,
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

/**
 * Liczy unikalne wektory po zaokrągleniu wartości do ośmiu miejsc.
 *
 * @param matrix - Macierz analizowanych próbek.
 * @returns Liczba różnych wierszy macierzy.
 */
function getUniqueRowsCount(matrix: NumericMatrix): number {
  return new Set(
    matrix.map((row) => row.map((value) => round(value, 8)).join(":"))
  ).size;
}

/** Oblicza kwadrat odległości euklidesowej pomiędzy dwoma wektorami. */
function squaredEuclideanDistance(left: number[], right: number[]): number {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0
  );
}

/** Oblicza odległość euklidesową pomiędzy dwoma wektorami. */
function euclideanDistance(left: number[], right: number[]): number {
  return Math.sqrt(squaredEuclideanDistance(left, right));
}

/** Oblicza średnią arytmetyczną wartości. */
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Zaokrągla wartość do wskazanej liczby miejsc po przecinku. */
function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}
