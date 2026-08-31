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
});
