import { describe, expect, it, vi } from "vitest";

import { createLastfmTrackService } from "./service.js";
import type {
  LastfmTrackApiResponse,
  LastfmTrackIdentifier,
  LastfmTrackTopTagsApiResponse,
} from "./types.js";

describe("Last.fm track service", () => {
  it("builds track.getInfo params from artist and track names", async () => {
    const response: LastfmTrackApiResponse = {
      track: {
        name: "Creep",
        artist: { name: "Radiohead" },
        toptags: { tag: [{ name: " alternative rock " }] },
      },
    };
    const fetchTrackInfo = vi.fn().mockResolvedValue(response);
    const service = createService({ fetchTrackInfo });
    const identifier = {
      artist: "Radiohead",
      track: "Creep",
      album: "Pablo Honey",
    } as LastfmTrackIdentifier & { album: string };

    await expect(service.getTrackMetadata(identifier)).resolves.toEqual({
      name: "Creep",
      artist: "Radiohead",
      mbid: null,
      url: null,
      tags: [{ name: "alternative rock", url: null }],
    });
    expect(fetchTrackInfo).toHaveBeenCalledWith({
      artist: "Radiohead",
      track: "Creep",
      autocorrect: 1,
    });
  });

  it("builds track.getInfo params from an MBID", async () => {
    const fetchTrackInfo = vi.fn().mockResolvedValue({});
    const service = createService({ fetchTrackInfo });

    await expect(
      service.getTrackMetadata({ mbid: "track-mbid" })
    ).resolves.toMatchObject({ artist: null });

    expect(fetchTrackInfo).toHaveBeenCalledWith({
      mbid: "track-mbid",
      autocorrect: 1,
    });
  });

  it("builds track.getTopTags params from the same identifier", async () => {
    const response: LastfmTrackTopTagsApiResponse = {
      toptags: {
        tag: [{ name: "alternative rock" }],
      },
    };
    const fetchTrackTopTags = vi.fn().mockResolvedValue(response);
    const service = createService({ fetchTrackTopTags });

    await expect(
      service.getTrackTopTags({
        artist: "Radiohead",
        track: "Creep",
      })
    ).resolves.toEqual([{ name: "alternative rock", url: null }]);
    expect(fetchTrackTopTags).toHaveBeenCalledWith({
      artist: "Radiohead",
      track: "Creep",
      autocorrect: 1,
    });
  });

  it("propagates request adapter errors", async () => {
    const requestError = new Error("Last.fm unavailable");
    const fetchTrackInfo = vi.fn().mockRejectedValue(requestError);
    const service = createService({ fetchTrackInfo });

    await expect(
      service.getTrackMetadata({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(requestError);
  });

  it("uses the requested artist when Last.fm omits artist metadata", async () => {
    const service = createService();

    await expect(
      service.getTrackMetadata({ artist: "Cher", track: "Believe" })
    ).resolves.toMatchObject({ artist: "Cher", tags: [] });
  });

  it("fetches top tags by MBID without artist or track parameters", async () => {
    const fetchTrackTopTags = vi.fn().mockResolvedValue({});
    const service = createService({ fetchTrackTopTags });

    await expect(
      service.getTrackTopTags({ mbid: "track-mbid" })
    ).resolves.toEqual([]);
    expect(fetchTrackTopTags).toHaveBeenCalledWith({
      mbid: "track-mbid",
      autocorrect: 1,
    });
  });

  it("propagates errors from the top tags request", async () => {
    const error = new Error("Last.fm unavailable");
    const service = createService({
      fetchTrackTopTags: vi.fn().mockRejectedValue(error),
    });

    await expect(
      service.getTrackTopTags({ artist: "Cher", track: "Believe" })
    ).rejects.toBe(error);
  });
});

function createService({
  fetchTrackInfo = vi.fn().mockResolvedValue({}),
  fetchTrackTopTags = vi.fn().mockResolvedValue({}),
} = {}) {
  return createLastfmTrackService({
    fetchTrackInfo,
    fetchTrackTopTags,
  });
}
