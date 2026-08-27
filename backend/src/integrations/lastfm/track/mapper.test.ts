import { describe, expect, it } from "vitest";

import { mapLastfmTrackMetadata, mapLastfmTrackTopTags } from "./mapper.js";

describe("Last.fm track mapper", () => {
  it("maps track metadata and normalizes all embedded tags", () => {
    const result = mapLastfmTrackMetadata(
      {
        track: {
          name: "Creep",
          mbid: "track-mbid",
          url: "https://www.last.fm/music/Radiohead/_/Creep",
          artist: { name: "Radiohead" },
          toptags: {
            tag: [
              {
                name: "  alternative rock  ",
                url: "https://www.last.fm/tag/alternative+rock",
              },
              { name: "seen live" },
            ],
          },
        },
      },
      "radiohead"
    );

    expect(result).toEqual({
      name: "Creep",
      artist: "Radiohead",
      mbid: "track-mbid",
      url: "https://www.last.fm/music/Radiohead/_/Creep",
      tags: [
        {
          name: "alternative rock",
          url: "https://www.last.fm/tag/alternative+rock",
        },
        { name: "seen live", url: null },
      ],
    });
  });

  it("uses the requested artist when Last.fm does not return one", () => {
    const result = mapLastfmTrackMetadata({}, "Unknown Artist");

    expect(result).toEqual({
      name: null,
      artist: "Unknown Artist",
      mbid: null,
      url: null,
      tags: [],
    });
  });

  it("returns a null artist when neither source provides one", () => {
    const result = mapLastfmTrackMetadata({}, null);

    expect(result.artist).toBeNull();
  });

  it("normalizes a single tag returned by track.getTopTags", () => {
    const result = mapLastfmTrackTopTags({
      toptags: {
        tag: {
          name: "  synthpop  ",
          url: "https://www.last.fm/tag/synthpop",
        },
      },
    });

    expect(result).toEqual([
      {
        name: "synthpop",
        url: "https://www.last.fm/tag/synthpop",
      },
    ]);
  });
});
