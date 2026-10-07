import { describe, expect, it, vi } from "vitest";

import { createLastfmArtistReader } from "./reader.js";
import type { LastfmArtistGateway } from "./types.js";

describe("Last.fm artist reader", () => {
  it("maps successful results to domain artist input", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getManyArtistInfoResults).mockResolvedValue([
      {
        status: "fulfilled",
        requestedName: "radiohead",
        response: {
          artist: {
            name: "Radiohead",
            tags: { tag: [{ name: "alternative rock" }] },
          },
        },
      },
    ]);
    const reader = createLastfmArtistReader(gateway);

    const result = await reader.getManyArtistGenreResults(["radiohead"]);

    expect(result[0]).toMatchObject({
      status: "fulfilled",
      artist: {
        resolvedName: "Radiohead",
        requestedName: "radiohead",
      },
    });
  });

  it("marks Last.fm error code 10 as invalid credentials", async () => {
    const gateway = createGateway();
    const error = Object.assign(new Error("Invalid API key"), { code: 10 });
    vi.mocked(gateway.getManyArtistInfoResults).mockResolvedValue([
      { status: "rejected", requestedName: "Radiohead", error },
    ]);
    const reader = createLastfmArtistReader(gateway);

    const result = await reader.getManyArtistGenreResults(["Radiohead"]);

    expect(result[0]).toMatchObject({
      status: "rejected",
      error,
      invalidCredentials: true,
    });
  });

  it("returns normalized tags for a single artist", async () => {
    const gateway = createGateway();
    vi.mocked(gateway.getArtistInfo).mockResolvedValue({
      artist: { tags: { tag: [{ name: " rock " }, { name: "seen live" }] } },
    });
    const reader = createLastfmArtistReader(gateway);

    await expect(reader.getArtistTags("Radiohead")).resolves.toEqual([
      { name: "rock", url: null },
      { name: "seen live", url: null },
    ]);
  });
});

function createGateway(): LastfmArtistGateway {
  return {
    getArtistInfo: vi.fn(),
    getManyArtistInfoResults: vi.fn(),
  };
}
