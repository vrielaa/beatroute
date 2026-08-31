import { describe, expect, it } from "vitest";

import {
  getCanonicalGenreName,
  isLikelyGenreTag,
  normalizeGenreName,
  normalizeLastfmTags,
} from "./genre-classifier.js";

describe("Last.fm genre classifier", () => {
  it("normalizes a single tag, arrays and invalid values", () => {
    expect(normalizeLastfmTags({ name: " Rock ", url: "url" })).toEqual([
      { name: "Rock", url: "url" },
    ]);
    expect(normalizeLastfmTags([{ name: "Pop" }, null, { name: " " }])).toEqual(
      [{ name: "Pop", url: null }]
    );
    expect(normalizeLastfmTags(undefined)).toEqual([]);
  });

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
  });

  it.each(["seen live", "favorites", "2020", "90s", ""])(
    "rejects non-genre tag %s",
    (tag) => {
      expect(getCanonicalGenreName(tag)).toBeNull();
      expect(isLikelyGenreTag({ name: tag, url: null })).toBe(false);
    }
  );
});
