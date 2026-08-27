import { describe, expect, it, vi } from "vitest";

import { createLastfmTrackGateway } from "./gateway.js";
import type {
  LastfmTrackApiResponse,
  LastfmTrackIdentifier,
  LastfmTrackTopTagsApiResponse,
} from "./types.js";

describe("Last.fm track gateway", () => {
  it("builds track.getInfo params from artist and track names", async () => {
    const response: LastfmTrackApiResponse = {
      track: { name: "Creep" },
    };
    const requestTrackInfo = vi.fn().mockResolvedValue(response);
    const gateway = createGateway({ requestTrackInfo });
    const identifier = {
      artist: "Radiohead",
      track: "Creep",
      album: "Pablo Honey",
    } as LastfmTrackIdentifier & { album: string };

    await expect(gateway.lookupTrack(identifier)).resolves.toBe(response);
    expect(requestTrackInfo).toHaveBeenCalledWith({
      artist: "Radiohead",
      track: "Creep",
      autocorrect: 1,
    });
  });

  it("builds track.getInfo params from an MBID", async () => {
    const requestTrackInfo = vi.fn().mockResolvedValue({});
    const gateway = createGateway({ requestTrackInfo });

    await gateway.lookupTrack({ mbid: "track-mbid" });

    expect(requestTrackInfo).toHaveBeenCalledWith({
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
    const requestTrackTopTags = vi.fn().mockResolvedValue(response);
    const gateway = createGateway({ requestTrackTopTags });

    await expect(
      gateway.lookupTrackTopTags({
        artist: "Radiohead",
        track: "Creep",
      })
    ).resolves.toBe(response);
    expect(requestTrackTopTags).toHaveBeenCalledWith({
      artist: "Radiohead",
      track: "Creep",
      autocorrect: 1,
    });
  });

  it("propagates request adapter errors", async () => {
    const requestError = new Error("Last.fm unavailable");
    const requestTrackInfo = vi.fn().mockRejectedValue(requestError);
    const gateway = createGateway({ requestTrackInfo });

    await expect(
      gateway.lookupTrack({ artist: "Radiohead", track: "Creep" })
    ).rejects.toBe(requestError);
  });
});

function createGateway({
  requestTrackInfo = vi.fn().mockResolvedValue({}),
  requestTrackTopTags = vi.fn().mockResolvedValue({}),
} = {}) {
  return createLastfmTrackGateway({
    requestTrackInfo,
    requestTrackTopTags,
  });
}
