import { describe, expect, it } from "vitest";

import { analyzeFeatureVectors } from "./analysis.js";

describe("analyzeFeatureVectors", () => {
  it("returns fallback analysis when there are no feature vectors", () => {
    const result = analyzeFeatureVectors([], ["energy"], null);

    expect(result).toMatchObject({
      selectedClusterCount: 0,
      selectedClusterCountSource: "fallback",
      clusterLabels: [],
      pcaCoordinates: [],
    });
  });

  it("throws when a vector length does not match the feature list", () => {
    expect(() =>
      analyzeFeatureVectors([[0.5]], ["energy", "tempo"], null)
    ).toThrow(RangeError);
  });

  it("throws when a vector contains a non-finite value", () => {
    expect(() =>
      analyzeFeatureVectors([[Number.NaN]], ["energy"], null)
    ).toThrow(TypeError);
  });

  it("throws when requested cluster count is invalid", () => {
    expect(() => analyzeFeatureVectors([[0.5]], ["energy"], 1)).toThrow(
      RangeError
    );
  });

  it("ignores constant features and returns PCA coordinates for every track", () => {
    const result = analyzeFeatureVectors(
      [
        [0.1, 120],
        [0.2, 120],
        [0.8, 120],
        [0.9, 120],
      ],
      ["energy", "tempo"],
      null
    );

    expect(result.activeFeatureKeys).toEqual(["energy"]);
    expect(result.clusterLabels).toHaveLength(4);
    expect(result.pcaCoordinates).toHaveLength(4);
    expect(result.explainedVariance).toEqual([1]);
  });

  it("uses fallback selection when the sample is too small to compare clusters", () => {
    const result = analyzeFeatureVectors([[0.2], [0.8]], ["energy"], null);

    expect(result.selectedClusterCount).toBe(1);
    expect(result.selectedClusterCountSource).toBe("fallback");
  });

  it("applies a valid manually selected cluster count", () => {
    const result = analyzeFeatureVectors(
      [[0.1], [0.2], [0.8], [0.9]],
      ["energy"],
      2
    );

    expect(result.selectedClusterCount).toBe(2);
    expect(result.selectedClusterCountSource).toBe("manual");
    expect(new Set(result.clusterLabels).size).toBe(2);
  });
});
