import { describe, expect, it } from "vitest";
import { buildArtistGenreDistribution } from "./artist-genre-distribution.js";
import type { Artist } from "./artist-genre-distribution.types.js";

describe("buildArtistGenreDistribution", () => {
  it("groups artists by their canonical genre", () => {
    const artists: Artist[] = [
      {
        name: "Artist A",
        genreCandidates: [
          {
            name: "Indie Rock",
            key: "indie rock",
            canonicalName: "rock",
          },
        ],
      },
      {
        name: "Artist B",
        genreCandidates: [
          {
            name: "Alternative Rock",
            key: "alternative rock",
            canonicalName: "rock",
          },
        ],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.totalArtists).toBe(2);
    expect(result.matchedArtists).toBe(2);
    expect(result.totalGenreMatches).toBe(2);
    expect(result.unmatchedArtists).toEqual([]);

    expect(result.genres).toHaveLength(1);
    expect(result.genres[0]).toMatchObject({
      name: "rock",
      count: 2,
      percentage: 100,
      artists: ["Artist A", "Artist B"],
    });
  });

  it("marks artists without genre candidates as unmatched", () => {
    const artists: Artist[] = [
      {
        name: "Artist C",
        genreCandidates: [],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.totalArtists).toBe(1);
    expect(result.matchedArtists).toBe(0);
    expect(result.totalGenreMatches).toBe(0);
    expect(result.unmatchedArtists).toEqual(["Artist C"]);
  });

  it("a candidate without a canonical name is ignored", () => {
    const artists: Artist[] = [
      {
        name: "Artist D",
        genreCandidates: [
          {
            name: "Unknown Genre",
            key: "unknown genre",
            canonicalName: null,
          },
        ],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.totalArtists).toBe(1);
    expect(result.matchedArtists).toBe(0);
    expect(result.totalGenreMatches).toBe(0);
    expect(result.unmatchedArtists).toEqual(["Artist D"]);
  });

  it("counts multiple subgenres of the same canonical genre", () => {
    const artists: Artist[] = [
      {
        name: "Artist E",
        genreCandidates: [
          {
            name: "Pop",
            key: "pop",
            canonicalName: "pop",
          },
          {
            name: "Dance Pop",
            key: "dance pop",
            canonicalName: "pop",
          },
        ],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.totalArtists).toBe(1);
    expect(result.matchedArtists).toBe(1);
    expect(result.totalGenreMatches).toBe(2);
    expect(result.unmatchedArtists).toEqual([]);

    expect(result.genres).toHaveLength(1);
    expect(result.genres[0]).toMatchObject({
      name: "pop",
      count: 2,
      percentage: 100,
      artists: ["Artist E"],
    });
  });

  it("groups subgenres under their canonical genre", () => {
    const result = buildArtistGenreDistribution([
      {
        name: "Artist A",
        genreCandidates: [
          { name: "Indie Rock", key: "indie rock", canonicalName: "rock" },
        ],
      },
      {
        name: "Artist B",
        genreCandidates: [
          { name: "indie-rock", key: "indie rock", canonicalName: "rock" },
        ],
      },
    ]);

    expect(result.genres[0].subgenres).toHaveLength(1);
    expect(result.genres[0].subgenres[0]).toMatchObject({
      count: 2,
      percentage: 100,
      artists: ["Artist A", "Artist B"],
    });
  });

  it("should sort genres by match count and then by name", () => {
    const artists: Artist[] = [
      {
        name: "Artist A",
        genreCandidates: [
          { name: "Indie Rock", key: "indie rock", canonicalName: "rock" },
        ],
      },
      {
        name: "Artist B",
        genreCandidates: [{ name: "Pop", key: "pop", canonicalName: "pop" }],
      },
      {
        name: "Artist C",
        genreCandidates: [
          {
            name: "Alternative Rock",
            key: "alternative rock",
            canonicalName: "rock",
          },
        ],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.genres[0].name).toBe("rock");
    expect(result.genres[1].name).toBe("pop");
  });
  it("should calculate percentage of genre matches correctly", () => {
    const artists: Artist[] = [
      {
        name: "Artist A",
        genreCandidates: [
          { name: "Indie Rock", key: "indie rock", canonicalName: "rock" },
        ],
      },
      {
        name: "Artist B",
        genreCandidates: [{ name: "Pop", key: "pop", canonicalName: "pop" }],
      },
      {
        name: "Artist C",
        genreCandidates: [
          {
            name: "Alternative Rock",
            key: "alternative rock",
            canonicalName: "rock",
          },
        ],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.genres[0].percentage).toBe(66.7);
    expect(result.genres[1].percentage).toBe(33.3);
  });
  it("should save the requested name of the artist if available", () => {
    const artists: Artist[] = [
      {
        name: "Actual name",
        requestedName: "Requested name",
        genreCandidates: [{ name: "Rock", key: "rock", canonicalName: "rock" }],
      },
    ];

    const result = buildArtistGenreDistribution(artists);

    expect(result.genres[0].artists[0]).toBe("Requested name");
  });

  it("should handle empty input", () => {
    const result = buildArtistGenreDistribution([]);

    expect(result.totalArtists).toBe(0);
    expect(result.matchedArtists).toBe(0);
    expect(result.totalGenreMatches).toBe(0);
    expect(result.unmatchedArtists).toEqual([]);
    expect(result.genres).toEqual([]);
  });
});
