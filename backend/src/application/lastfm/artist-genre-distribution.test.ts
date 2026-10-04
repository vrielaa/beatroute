import { describe, expect, it, vi } from "vitest";

import { createArtistGenreDistribution } from "./artist-genre-distribution.js";
import type {
  ArtistGenreLookup,
  ArtistGenreReader,
} from "./artist-genre-distribution.js";

describe("artist genre distribution use case", () => {
  it("deduplicates artist names before reading their genres", async () => {
    const reader = createReader([fulfilledLookup("Radiohead", "alternative")]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    const result = await getDistribution([
      "Radiohead",
      "radiohead",
      "RADIOHEAD",
    ]);

    expect(reader.lookupMany).toHaveBeenCalledWith(["Radiohead"]);
    expect(result).toMatchObject({
      source: "lastfm-artist-info-tags",
      totalArtists: 1,
      matchedArtists: 1,
    });
  });

  it("keeps a partial failure as an unmatched artist", async () => {
    const reader = createReader([
      fulfilledLookup("Radiohead", "alternative"),
      rejectedLookup("Unknown Artist", new Error("Not found")),
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
      fulfilledLookup("Radiohead", "rock"),
      rejectedLookup("Muse", error, true),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    await expect(getDistribution(["Radiohead", "Muse"])).rejects.toBe(error);
  });

  it("propagates the first error when every lookup fails", async () => {
    const firstError = new Error("Last.fm unavailable");
    const reader = createReader([
      rejectedLookup("Radiohead", firstError),
      rejectedLookup("Muse", new Error("Timeout")),
    ]);
    const getDistribution = createArtistGenreDistribution({
      artistReader: reader,
    });

    await expect(getDistribution(["Radiohead", "Muse"])).rejects.toBe(
      firstError
    );
  });
});

function createReader(lookups: ArtistGenreLookup[]): ArtistGenreReader {
  return { lookupMany: vi.fn().mockResolvedValue(lookups) };
}

function fulfilledLookup(
  requestedName: string,
  canonicalName: string
): ArtistGenreLookup {
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

function rejectedLookup(
  requestedName: string,
  error: unknown,
  invalidCredentials = false
): ArtistGenreLookup {
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
