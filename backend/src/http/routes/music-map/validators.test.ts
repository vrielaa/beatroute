import { describe, expect, it } from "vitest";
import { parseMusicMapQuery } from "./validators.js";

describe("music map query validation", () => {
  it("uses defaults suitable for the music map", () => {
    expect(parseMusicMapQuery()).toEqual({
      limit: 40,
      timeRange: "long_term",
      clusterCount: null,
    });
  });

  it("parses a manually selected cluster count", () => {
    expect(
      parseMusicMapQuery({
        limit: "20",
        time_range: "short_term",
        clusters: "4",
      })
    ).toEqual({
      limit: 20,
      timeRange: "short_term",
      clusterCount: 4,
    });
  });

  it("rejects an unsupported cluster count", () => {
    expect(() => parseMusicMapQuery({ clusters: "9" })).toThrow(
      'Parametr "clusters" musi być liczbą całkowitą od 2 do 8'
    );
  });

  it("rejects a repeated cluster parameter", () => {
    expect(() => parseMusicMapQuery({ clusters: ["3", "4"] })).toThrow(
      'Parametr "clusters" może wystąpić tylko raz'
    );
  });
});
