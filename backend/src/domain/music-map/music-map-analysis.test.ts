import { describe, expect, it } from "vitest";

import { analyzeMusicMapRows } from "./music-map-analysis.js";

describe("analyzeMusicMapRows", () => {
  it("returns fallback analysis when there are no feature vectors", () => {
    const result = analyzeMusicMapRows([], ["energy"], null);

    expect(result).toMatchObject({
      selectedClusterCount: 0,
      selectedClusterCountSource: "fallback",
      clusterLabels: [],
      coordinates: [],
    });
  });

  it("throws when a vector length does not match the feature list", () => {
    expect(() =>
      analyzeMusicMapRows([[0.5]], ["energy", "tempo"], null),
    ).toThrow(RangeError);
  });

  it("throws when a vector contains a non-finite value", () => {
    expect(() => analyzeMusicMapRows([[Number.NaN]], ["energy"], null)).toThrow(
      TypeError,
    );
  });

  it("throws when requested cluster count is invalid", () => {
    expect(() => analyzeMusicMapRows([[0.5]], ["energy"], 1)).toThrow(
      RangeError,
    );
  });
});
