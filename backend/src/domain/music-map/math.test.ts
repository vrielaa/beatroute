import { describe, expect, it } from "vitest";
import { average, round, scaleNumberToRange } from "./math.js";

describe("music map math", () => {
  it("scales a value between arbitrary ranges", () => {
    expect(scaleNumberToRange(50, 0, 100, -1, 1)).toBe(0);
    expect(scaleNumberToRange(25, 0, 100, 0, 10)).toBe(2.5);
  });

  it("uses the target midpoint when the source range has no spread", () => {
    expect(scaleNumberToRange(5, 5, 5, -1, 1)).toBe(0);
  });

  it("calculates and rounds numeric results", () => {
    expect(average([2, 4, 6])).toBe(4);
    expect(round(1.23456, 3)).toBe(1.235);
  });
});
