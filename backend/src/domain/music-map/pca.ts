import { PCA } from "ml-pca";
import { round, scaleNumberToRange } from "./math.js";
import type { FeatureMatrix, PcaCoordinate } from "./types.js";

/** Wynik PCA wraz z udziałem wariancji wyjaśnionej przez wyznaczone osie. */
type PcaResult = {
  coordinates: PcaCoordinate[];
  explainedVariance: number[];
};

/** Redukuje standaryzowane dane do dwóch wymiarów metodą PCA. */
function calculatePca(matrix: FeatureMatrix): PcaResult {
  if (matrix[0].length === 1) {
    return calculateSingleFeaturePca(matrix);
  }

  const pca = new PCA(matrix, { center: false, scale: false });

  return {
    coordinates: pca
      .predict(matrix, { nComponents: 2 })
      .to2DArray()
      .map((row): PcaCoordinate => [row[0] ?? 0, row[1] ?? 0]),
    explainedVariance: pca
      .getExplainedVariance()
      .slice(0, 2)
      .map((value) => round(value, 4)),
  };
}

/** Umieszcza jedną aktywną cechę na osi X w zakresie od -1 do 1. */
function calculateSingleFeaturePca(matrix: FeatureMatrix): PcaResult {
  const values = matrix.map((row) => row[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    coordinates: values.map((value): PcaCoordinate => [
      scaleNumberToRange(value, min, max, -1, 1),
      0,
    ]),
    explainedVariance: [1],
  };
}

export { calculatePca };
