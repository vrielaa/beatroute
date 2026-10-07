import { describe, expect, it } from "vitest";

import {
  mapArtistInfoResultToGenreInput,
  mapLastfmArtistInfo,
} from "./mapper.js";

describe("Last.fm artist mapper", () => {
  describe("mapLastfmArtistInfo", () => {
    it("normalizes all tags and selects only genre candidates", () => {
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

  describe("mapArtistInfoResultToGenreInput", () => {
    it("maps genre candidates to normalized and canonical names", () => {
      const result = mapArtistInfoResultToGenreInput({
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

    it("maps a rejected result to an artist without genre candidates", () => {
      const result = mapArtistInfoResultToGenreInput({
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
