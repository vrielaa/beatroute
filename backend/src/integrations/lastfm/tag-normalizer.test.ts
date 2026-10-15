import { describe, expect, it } from "vitest";
import { normalizeLastfmTags } from "./tag-normalizer.js";

describe("Last.fm tag normalizer", () => {
  it("normalizes a single tag and preserves its URL", () => {
    expect(normalizeLastfmTags({ name: " Rock ", url: "url" })).toEqual([
      { name: "Rock", url: "url" },
    ]);
  });

  it("keeps genre and non-genre tags without classifying them", () => {
    expect(
      normalizeLastfmTags([{ name: "Pop" }, { name: "seen live" }])
    ).toEqual([
      { name: "Pop", url: null },
      { name: "seen live", url: null },
    ]);
  });

  it("skips invalid entries and normalizes missing or non-text URLs", () => {
    expect(
      normalizeLastfmTags([
        null,
        undefined,
        "rock",
        1,
        {},
        { name: " " },
        { name: 123 },
        { name: " Pop " },
        { name: "Rock", url: 123 },
      ])
    ).toEqual([
      { name: "Pop", url: null },
      { name: "Rock", url: null },
    ]);
  });

  it.each([null, undefined, false, 1, "rock"])(
    "returns no tags for invalid or missing input %s",
    (value) => {
      expect(normalizeLastfmTags(value)).toEqual([]);
    }
  );
});
