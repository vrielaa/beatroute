import { describe, expect, it, vi } from "vitest";

import { createArtistGenreDistribution } from "./artist-genre-distribution.js";
import type {
  ArtistGenreResult,
  ArtistGenreReader,
} from "./artist-genre-distribution.js";

describe("artist genre distribution use case", () => {
  it("deduplicates artist names before reading their genres", async () => {
    const reader = createReader([
      fulfilledGenreResult("Radiohead", "alternative"),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    const result = await getDistribution([
      "Radiohead",
      "radiohead",
      "RADIOHEAD",
    ]);

    expect(reader.getManyArtistGenreResults).toHaveBeenCalledWith([
      "Radiohead",
    ]);
    expect(result).toMatchObject({
      source: "lastfm-artist-info-tags",
      totalArtists: 1,
      matchedArtists: 1,
    });
  });

  it("keeps a partial failure as an unmatched artist", async () => {
    const reader = createReader([
      fulfilledGenreResult("Radiohead", "alternative"),
      rejectedGenreResult("Unknown Artist", new Error("Not found")),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    const result = await getDistribution(["Radiohead", "Unknown Artist"]);

    expect(result.matchedArtists).toBe(1);
    expect(result.unmatchedArtists).toEqual(["Unknown Artist"]);
  });

  it("propagates an invalid credentials failure", async () => {
    const error = new Error("Invalid API key");
    const reader = createReader([
      fulfilledGenreResult("Radiohead", "rock"),
      rejectedGenreResult("Muse", error, true),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    await expect(getDistribution(["Radiohead", "Muse"])).rejects.toBe(error);
  });

  it("propagates the first error when every artist request fails", async () => {
    const firstError = new Error("Last.fm unavailable");
    const reader = createReader([
      rejectedGenreResult("Radiohead", firstError),
      rejectedGenreResult("Muse", new Error("Timeout")),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    await expect(getDistribution(["Radiohead", "Muse"])).rejects.toBe(
      firstError
    );
  });
});

function createReader(results: ArtistGenreResult[]): ArtistGenreReader {
  return { getManyArtistGenreResults: vi.fn().mockResolvedValue(results) };
}

function fulfilledGenreResult(
  requestedName: string,
  canonicalName: string
): ArtistGenreResult {
  return {
    status: "fulfilled",
    artist: {
      resolvedName: requestedName,
      requestedName,
      genreCandidates: [
        { name: canonicalName, key: canonicalName, canonicalName },
      ],
    },
  };
}

function rejectedGenreResult(
  requestedName: string,
  error: unknown,
  invalidCredentials = false
): ArtistGenreResult {
  return {
    status: "rejected",
    artist: {
      resolvedName: requestedName,
      requestedName,
      genreCandidates: [],
    },
    error,
    invalidCredentials,
  };
}
