import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLastfmArtistService } from "./service.js";
import type { LastfmArtistGateway, LastfmArtistLookup } from "./types.js";

describe("Last.fm artist service", () => {
  let artistGateway: LastfmArtistGateway;

  beforeEach(() => {
    artistGateway = {
      lookupArtist: vi.fn(),
      lookupMany: vi.fn(),
    };
  });

  it("maps a gateway response to application artist information", async () => {
    vi.mocked(artistGateway.lookupArtist).mockResolvedValue({
      artist: {
        name: "Radiohead",
        mbid: "artist-mbid",
        tags: {
          tag: [{ name: "alternative rock" }],
        },
      },
    });
    const service = createLastfmArtistService({ artistGateway });

    const result = await service.getArtistInfo("radiohead");

    expect(result).toMatchObject({
      name: "Radiohead",
      requestedName: "radiohead",
      mbid: "artist-mbid",
      genre: "alternative rock",
      genreCandidates: ["alternative rock"],
    });
  });

  it("removes duplicate artist names before using the gateway", async () => {
    vi.mocked(artistGateway.lookupMany).mockResolvedValue([
      fulfilledLookup("Radiohead", "alternative rock"),
    ]);
    const service = createLastfmArtistService({ artistGateway });

    const result = await service.getArtistGenreDistribution([
      "Radiohead",
      "radiohead",
      "RADIOHEAD",
    ]);

    expect(artistGateway.lookupMany).toHaveBeenCalledWith(["Radiohead"]);
    expect(result).toMatchObject({
      source: "lastfm-artist-info-tags",
      totalArtists: 1,
      matchedArtists: 1,
    });
  });

  it("keeps a partial failure as an unmatched artist", async () => {
    vi.mocked(artistGateway.lookupMany).mockResolvedValue([
      fulfilledLookup("Radiohead", "alternative rock"),
      rejectedLookup("Unknown Artist", new Error("Not found")),
    ]);
    const service = createLastfmArtistService({ artistGateway });

    const result = await service.getArtistGenreDistribution([
      "Radiohead",
      "Unknown Artist",
    ]);

    expect(result.matchedArtists).toBe(1);
    expect(result.unmatchedArtists).toEqual(["Unknown Artist"]);
  });

  it("throws when Last.fm reports an invalid API key", async () => {
    const invalidApiKeyError = Object.assign(new Error("Invalid API key"), {
      code: 10,
    });
    vi.mocked(artistGateway.lookupMany).mockResolvedValue([
      fulfilledLookup("Radiohead", "rock"),
      rejectedLookup("Muse", invalidApiKeyError),
    ]);
    const service = createLastfmArtistService({ artistGateway });

    await expect(
      service.getArtistGenreDistribution(["Radiohead", "Muse"])
    ).rejects.toBe(invalidApiKeyError);
  });

  it("throws the first error when all artist lookups fail", async () => {
    const firstError = new Error("Last.fm unavailable");
    vi.mocked(artistGateway.lookupMany).mockResolvedValue([
      rejectedLookup("Radiohead", firstError),
      rejectedLookup("Muse", new Error("Timeout")),
    ]);
    const service = createLastfmArtistService({ artistGateway });

    await expect(
      service.getArtistGenreDistribution(["Radiohead", "Muse"])
    ).rejects.toBe(firstError);
  });
});

function fulfilledLookup(
  requestedName: string,
  genre: string
): LastfmArtistLookup {
  return {
    status: "fulfilled",
    requestedName,
    response: {
      artist: {
        name: requestedName,
        tags: {
          tag: [{ name: genre }],
        },
      },
    },
  };
}

function rejectedLookup(
  requestedName: string,
  error: unknown
): LastfmArtistLookup {
  return {
    status: "rejected",
    requestedName,
    error,
  };
}
