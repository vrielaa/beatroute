import { describe, expect, it } from "vitest";

import {
  getCanonicalGenreName,
  isLikelyGenreName,
  normalizeGenreName,
} from "./genre-classifier.js";

describe("genre classifier", () => {
  it("normalizes punctuation and ampersands for rule matching", () => {
    expect(normalizeGenreName("  R&B / Soul  ")).toBe("r n b soul");
  });

  it.each([
    ["alternative rock", "alternative"],
    ["drum and bass", "drum and bass"],
    ["indie pop", "indie"],
    ["synthpop", "pop"],
    ["hip-hop", "hip hop"],
  ])("maps %s to %s", (tag, genre) => {
    expect(getCanonicalGenreName(tag)).toBe(genre);
    expect(isLikelyGenreName(tag)).toBe(true);
  });

  it.each(["seen live", "favorites", "2020", "90s", ""])(
    "rejects non-genre tag %s",
    (tag) => {
      expect(getCanonicalGenreName(tag)).toBeNull();
      expect(isLikelyGenreName(tag)).toBe(false);
    }
  );
});
