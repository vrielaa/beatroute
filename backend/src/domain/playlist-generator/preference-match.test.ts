import { describe, expect, it } from "vitest";
import { calculatePreferenceMatch } from "./preference-match.js";
import type { PlaylistPreferenceLevel } from "./types.js";

describe("calculatePreferenceMatch", () => {
  describe("low", () => {
    it.each([
      { measurement: 0, expected: 1 },
      { measurement: 0.1, expected: 1 },
      { measurement: 0.25, expected: 1 },
      { measurement: 0.3, expected: 0.8 },
      { measurement: 0.375, expected: 0.5 },
      { measurement: 0.4, expected: 0.4 },
      { measurement: 0.5, expected: 0 },
      { measurement: 0.75, expected: 0 },
      { measurement: 1, expected: 0 },
    ])(
      "returns $expected for measurement $measurement",
      ({ measurement, expected }) => {
        expect(calculatePreferenceMatch(measurement, "low")).toBeCloseTo(
          expected
        );
      }
    );
  });

  describe("medium", () => {
    it.each([
      { measurement: 0, expected: 0 },
      { measurement: 0.25, expected: 0 },
      { measurement: 0.3, expected: 0.2 },
      { measurement: 0.375, expected: 0.5 },
      { measurement: 0.5, expected: 1 },
      { measurement: 0.625, expected: 0.5 },
      { measurement: 0.7, expected: 0.2 },
      { measurement: 0.75, expected: 0 },
      { measurement: 1, expected: 0 },
    ])(
      "returns $expected for measurement $measurement",
      ({ measurement, expected }) => {
        expect(calculatePreferenceMatch(measurement, "medium")).toBeCloseTo(
          expected
        );
      }
    );
  });

  describe("high", () => {
    it.each([
      { measurement: 0, expected: 0 },
      { measurement: 0.25, expected: 0 },
      { measurement: 0.5, expected: 0 },
      { measurement: 0.6, expected: 0.4 },
      { measurement: 0.625, expected: 0.5 },
      { measurement: 0.7, expected: 0.8 },
      { measurement: 0.75, expected: 1 },
      { measurement: 0.9, expected: 1 },
      { measurement: 1, expected: 1 },
    ])(
      "returns $expected for measurement $measurement",
      ({ measurement, expected }) => {
        expect(calculatePreferenceMatch(measurement, "high")).toBeCloseTo(
          expected
        );
      }
    );
  });

  const levels: PlaylistPreferenceLevel[] = ["low", "medium", "high"];

  it.each(levels)("keeps %s scores within 0–1", (level) => {
    for (let step = 0; step <= 100; step++) {
      const result = calculatePreferenceMatch(step / 100, level);

      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it("never increases low matching as the measurement increases", () => {
    let previousMatch = calculatePreferenceMatch(0, "low");

    for (let step = 1; step <= 100; step++) {
      const match = calculatePreferenceMatch(step / 100, "low");

      expect(match).toBeLessThanOrEqual(previousMatch);
      previousMatch = match;
    }
  });

  it("never decreases high matching as the measurement increases", () => {
    let previousMatch = calculatePreferenceMatch(0, "high");

    for (let step = 1; step <= 100; step++) {
      const match = calculatePreferenceMatch(step / 100, "high");

      expect(match).toBeGreaterThanOrEqual(previousMatch);
      previousMatch = match;
    }
  });

  it("increases medium matching toward 0.5 and decreases it afterward", () => {
    let previousMatch = calculatePreferenceMatch(0, "medium");

    for (let step = 1; step <= 100; step++) {
      const match = calculatePreferenceMatch(step / 100, "medium");

      if (step <= 50) {
        expect(match).toBeGreaterThanOrEqual(previousMatch);
      } else {
        expect(match).toBeLessThanOrEqual(previousMatch);
      }

      previousMatch = match;
    }
  });
});
