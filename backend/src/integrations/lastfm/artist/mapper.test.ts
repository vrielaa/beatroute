import { describe, expect, it } from "vitest";

import { mapArtistLookupToGenreInput, mapLastfmArtistInfo } from "./mapper.js";

describe("Last.fm artist mapper", () => {
  describe("mapLastfmArtistInfo", () => {
    it("normalizes artist data and keeps only genre-like tag candidates", () => {
      const result = mapLastfmArtistInfo(
        {
          artist: {
            name: "Radiohead",
            mbid: "artist-mbid",
            url: "https://www.last.fm/music/Radiohead",
            tags: {
              tag: [
                {
                  name: "  Alternative Rock  ",
                  url: "https://www.last.fm/tag/alternative+rock",
                },
                { name: "seen live" },
                { name: "2020s" },
              ],
            },
          },
        },
        "radiohead"
      );

      expect(result).toEqual({
        name: "Radiohead",
        requestedName: "radiohead",
        mbid: "artist-mbid",
        url: "https://www.last.fm/music/Radiohead",
        genre: "Alternative Rock",
        genreCandidates: ["Alternative Rock"],
        tags: [
          {
            name: "Alternative Rock",
            url: "https://www.last.fm/tag/alternative+rock",
          },
          { name: "seen live", url: null },
          { name: "2020s", url: null },
        ],
      });
    });

    it("uses safe fallback values for an incomplete API response", () => {
      const result = mapLastfmArtistInfo({}, "Unknown Artist");

      expect(result).toEqual({
        name: "Unknown Artist",
        requestedName: "Unknown Artist",
        mbid: null,
        url: null,
        genre: null,
        genreCandidates: [],
        tags: [],
      });
    });
  });

  describe("mapArtistLookupToGenreInput", () => {
    it("maps genre candidates to normalized and canonical names", () => {
      const result = mapArtistLookupToGenreInput({
        status: "fulfilled",
        requestedName: "radiohead",
        response: {
          artist: {
            name: "Radiohead",
            tags: {
              tag: [{ name: "Alternative Rock" }, { name: "seen live" }],
            },
          },
        },
      });

      expect(result).toEqual({
        resolvedName: "Radiohead",
        requestedName: "radiohead",
        genreCandidates: [
          {
            name: "Alternative Rock",
            key: "alternative rock",
            canonicalName: "alternative",
          },
        ],
      });
    });

    it("maps a rejected lookup to an artist without genre candidates", () => {
      const result = mapArtistLookupToGenreInput({
        status: "rejected",
        requestedName: "Unknown Artist",
        error: new Error("Not found"),
      });

      expect(result).toEqual({
        resolvedName: "Unknown Artist",
        requestedName: "Unknown Artist",
        genreCandidates: [],
      });
    });
  });
});
