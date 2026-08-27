import { describe, expect, it, vi } from "vitest";

import type { LastfmTag } from "../types.js";
import { createLastfmTrackService } from "./service.js";
import type { LastfmTrackGateway } from "./types.js";

describe("Last.fm track service", () => {
  it("uses genre tags included in track.getInfo", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: {
        name: "Creep",
        mbid: "track-mbid",
        url: "https://www.last.fm/music/Radiohead/_/Creep",
        artist: { name: "Radiohead" },
        toptags: {
          tag: [
            { name: "alternative rock", url: "https://last.fm/tag/rock" },
            { name: "seen live" },
          ],
        },
      },
    });

    const result = await service.getTrackInfo({
      artist: "radiohead",
      track: "creep",
    });

    expect(result).toEqual({
      name: "Creep",
      artist: "Radiohead",
      mbid: "track-mbid",
      url: "https://www.last.fm/music/Radiohead/_/Creep",
      genre: "alternative rock",
      genreCandidates: ["alternative rock"],
      tags: [
        { name: "alternative rock", url: "https://last.fm/tag/rock" },
        { name: "seen live", url: null },
      ],
      genreSource: "lastfm-top-tags",
      genreIsFallback: false,
    });
    expect(trackGateway.lookupTrackTopTags).not.toHaveBeenCalled();
    expect(getArtistTags).not.toHaveBeenCalled();
  });

  it("uses track.getTopTags when track.getInfo has no genre tags", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: {
        name: "Creep",
        artist: { name: "Radiohead" },
        toptags: { tag: [{ name: "seen live" }] },
      },
    });
    vi.mocked(trackGateway.lookupTrackTopTags).mockResolvedValue({
      toptags: {
        tag: [{ name: "alternative rock" }, { name: "90s" }],
      },
    });

    const result = await service.getTrackInfo({
      artist: "Radiohead",
      track: "Creep",
    });

    expect(result.genre).toBe("alternative rock");
    expect(result.genreCandidates).toEqual(["alternative rock"]);
    expect(result.genreSource).toBe("lastfm-track-top-tags");
    expect(result.genreIsFallback).toBe(false);
    expect(getArtistTags).not.toHaveBeenCalled();
  });

  it("uses artist tags when both track tag sources have no genres", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: {
        name: "Creep",
        artist: { name: "Radiohead" },
        toptags: { tag: [{ name: "seen live" }] },
      },
    });
    vi.mocked(trackGateway.lookupTrackTopTags).mockResolvedValue({
      toptags: { tag: [{ name: "90s" }] },
    });
    getArtistTags.mockResolvedValue([
      { name: "alternative rock", url: null },
      { name: "british", url: null },
    ]);

    const result = await service.getTrackInfo({
      artist: "radio head",
      track: "creep",
    });

    expect(getArtistTags).toHaveBeenCalledWith("Radiohead");
    expect(result.genre).toBe("alternative rock");
    expect(result.genreCandidates).toEqual(["alternative rock"]);
    expect(result.genreSource).toBe("lastfm-artist-info-tags");
    expect(result.genreIsFallback).toBe(true);
  });

  it("returns no genre when every source has only non-genre tags", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: {
        name: "Unknown Track",
        artist: { name: "Unknown Artist" },
      },
    });
    vi.mocked(trackGateway.lookupTrackTopTags).mockResolvedValue({
      toptags: { tag: [{ name: "seen live" }] },
    });
    getArtistTags.mockResolvedValue([{ name: "2020s", url: null }]);

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
    expect(result.tags).toEqual([{ name: "2020s", url: null }]);
  });

  it("does not request artist tags when an MBID response has no artist", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: { name: "Unknown Track" },
    });
    vi.mocked(trackGateway.lookupTrackTopTags).mockResolvedValue({});

    const result = await service.getTrackInfo({ mbid: "track-mbid" });

    expect(getArtistTags).not.toHaveBeenCalled();
    expect(result.artist).toBeNull();
    expect(result.genre).toBeNull();
  });

  it("propagates a track gateway error without running fallbacks", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    const requestError = new Error("Last.fm unavailable");
    vi.mocked(trackGateway.lookupTrack).mockRejectedValue(requestError);

    await expect(
      service.getTrackInfo({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(requestError);
    expect(trackGateway.lookupTrackTopTags).not.toHaveBeenCalled();
    expect(getArtistTags).not.toHaveBeenCalled();
  });

  it("propagates a top-tags error instead of hiding it with artist fallback", async () => {
    const { service, trackGateway, getArtistTags } = createService();
    const requestError = new Error("Top tags unavailable");
    vi.mocked(trackGateway.lookupTrack).mockResolvedValue({
      track: {
        name: "Creep",
        artist: { name: "Radiohead" },
      },
    });
    vi.mocked(trackGateway.lookupTrackTopTags).mockRejectedValue(requestError);

    await expect(
      service.getTrackInfo({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(requestError);
    expect(getArtistTags).not.toHaveBeenCalled();
  });
});

function createService() {
  const trackGateway: LastfmTrackGateway = {
    lookupTrack: vi.fn(),
    lookupTrackTopTags: vi.fn(),
  };
  const getArtistTags = vi.fn(
    async (_artistName: string): Promise<LastfmTag[]> => []
  );

  return {
    trackGateway,
    getArtistTags,
    service: createLastfmTrackService({
      trackGateway,
      getArtistTags,
    }),
  };
}
