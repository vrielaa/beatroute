import { describe, expect, it, vi } from "vitest";

import { createLastfmTrackInfo } from "./track-info.js";
import type { LastfmTrackReader } from "./track-info.js";
import type { LastfmTag, LastfmTrackMetadata } from "./types.js";

describe("Last.fm track info use case", () => {
  it("uses genre tags included in the primary track metadata", async () => {
    const dependencies = createDependencies({
      tags: [genreTag("alternative rock"), nonGenreTag("seen live")],
    });
    const service = createLastfmTrackInfo(dependencies);

    const result = await service.getTrackInfo({
      artist: "radiohead",
      track: "creep",
    });

    expect(result.genre).toBe("alternative rock");
    expect(result.genreSource).toBe("lastfm-top-tags");
    expect(dependencies.trackReader.getTrackTopTags).not.toHaveBeenCalled();
    expect(dependencies.getArtistTags).not.toHaveBeenCalled();
  });

  it("uses separately fetched track tags as the second source", async () => {
    const dependencies = createDependencies({
      tags: [nonGenreTag("seen live")],
    });
    vi.mocked(dependencies.trackReader.getTrackTopTags).mockResolvedValue([
      genreTag("alternative rock"),
      nonGenreTag("90s"),
    ]);
    const service = createLastfmTrackInfo(dependencies);

    const result = await service.getTrackInfo({
      artist: "Radiohead",
      track: "Creep",
    });

    expect(result.genre).toBe("alternative rock");
    expect(result.genreSource).toBe("lastfm-track-top-tags");
    expect(dependencies.getArtistTags).not.toHaveBeenCalled();
  });

  it("uses artist tags only when both track sources contain no genre", async () => {
    const dependencies = createDependencies({
      tags: [nonGenreTag("seen live")],
    });
    vi.mocked(dependencies.trackReader.getTrackTopTags).mockResolvedValue([
      nonGenreTag("90s"),
    ]);
    dependencies.getArtistTags.mockResolvedValue([
      genreTag("alternative rock"),
    ]);
    const service = createLastfmTrackInfo(dependencies);

    const result = await service.getTrackInfo({
      artist: "Radiohead",
      track: "Creep",
    });

    expect(dependencies.getArtistTags).toHaveBeenCalledWith("Radiohead");
    expect(result.genreSource).toBe("lastfm-artist-info-tags");
    expect(result.genreIsFallback).toBe(true);
  });

  it("returns no genre when none of the sources contains one", async () => {
    const dependencies = createDependencies({ tags: [] });
    dependencies.getArtistTags.mockResolvedValue([nonGenreTag("2020s")]);
    const service = createLastfmTrackInfo(dependencies);

    const result = await service.getTrackInfo({
      artist: "Unknown Artist",
      track: "Unknown Track",
    });

    expect(result).toMatchObject({
      genre: null,
      genreCandidates: [],
      genreSource: null,
      genreIsFallback: false,
    });
  });

  it("does not request artist tags when metadata contains no artist", async () => {
    const dependencies = createDependencies({ artist: null, tags: [] });
    const service = createLastfmTrackInfo(dependencies);

    await service.getTrackInfo({ mbid: "track-mbid" });

    expect(dependencies.getArtistTags).not.toHaveBeenCalled();
  });

  it("propagates a primary metadata failure without running fallbacks", async () => {
    const dependencies = createDependencies({ tags: [] });
    const error = new Error("Last.fm unavailable");
    vi.mocked(dependencies.trackReader.getTrackMetadata).mockRejectedValue(
      error
    );
    const service = createLastfmTrackInfo(dependencies);

    await expect(
      service.getTrackInfo({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(error);
    expect(dependencies.trackReader.getTrackTopTags).not.toHaveBeenCalled();
    expect(dependencies.getArtistTags).not.toHaveBeenCalled();
  });

  it("propagates a top-tags failure instead of hiding it with artist tags", async () => {
    const dependencies = createDependencies({ tags: [] });
    const error = new Error("Top tags unavailable");
    vi.mocked(dependencies.trackReader.getTrackTopTags).mockRejectedValue(
      error
    );
    const service = createLastfmTrackInfo(dependencies);

    await expect(
      service.getTrackInfo({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(error);
    expect(dependencies.getArtistTags).not.toHaveBeenCalled();
  });
});

function createDependencies(metadataOverrides: Partial<LastfmTrackMetadata>) {
  const metadata: LastfmTrackMetadata = {
    name: "Creep",
    artist: "Radiohead",
    mbid: "track-mbid",
    url: "https://www.last.fm/music/Radiohead/_/Creep",
    tags: [],
    ...metadataOverrides,
  };
  const trackReader: LastfmTrackReader = {
    getTrackMetadata: vi.fn().mockResolvedValue(metadata),
    getTrackTopTags: vi.fn().mockResolvedValue([]),
  };

  return {
    trackReader,
    getArtistTags: vi.fn<(artistName: string) => Promise<LastfmTag[]>>(),
    isGenreTag: (tag: LastfmTag) => tag.name === "alternative rock",
  };
}

function genreTag(name: string): LastfmTag {
  return { name, url: null };
}

function nonGenreTag(name: string): LastfmTag {
  return { name, url: null };
}
