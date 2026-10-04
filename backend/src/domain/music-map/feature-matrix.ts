import { average } from "./math.js";
import type { FeatureMatrix, MusicMapFeatureKey } from "./types.js";

/**
 * Sprawdza, czy wszystkie wektory mają oczekiwany rozmiar i poprawne liczby.
 * Pusty zbiór jest poprawny i zostanie obsłużony przez analizę fallbackową.
 */
function validateFeatureMatrix(
  featureVectors: FeatureMatrix,
  featureKeys: MusicMapFeatureKey[]
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
}

/**
 * Usuwa cechy o identycznej wartości dla wszystkich utworów.
 * Zwraca nazwy aktywnych cech i macierz zawierającą tylko ich wartości.
 */
function selectVariableFeatures(
  featureVectors: FeatureMatrix,
  featureKeys: MusicMapFeatureKey[]
) {
  const activeFeatureIndexes = getVariableFeatureIndexes(
    featureVectors,
    featureKeys
  );

  return {
    activeFeatureKeys: activeFeatureIndexes.map((index) => featureKeys[index]),
    matrix: featureVectors.map((vector) =>
      activeFeatureIndexes.map((index) => vector[index])
    ),
  };
}

/** Wskazuje kolumny, których wartości różnią się pomiędzy utworami. */
function getVariableFeatureIndexes(
  featureVectors: FeatureMatrix,
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
 * Standaryzuje każdą kolumnę do średniej 0 i odchylenia standardowego 1.
 * Dzięki temu cechy o dużej skali, np. tempo, nie dominują klasteryzacji.
 */
function standardizeFeatureMatrix(matrix: FeatureMatrix): FeatureMatrix {
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

export {
  validateFeatureMatrix,
  selectVariableFeatures,
  standardizeFeatureMatrix,
};
