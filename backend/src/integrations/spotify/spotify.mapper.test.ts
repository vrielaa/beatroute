import { describe, expect, it } from "vitest";

import {
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "./spotify.mapper.js";
import type { SpotifyTrackApiResponse } from "./spotify.types.js";

describe("Spotify track mapper", () => {
  it("maps a Spotify track to a Last.fm text identifier", () => {
    expect(mapSpotifyTrackForLastfm(createSpotifyTrack())).toEqual({
      artist: "Cher",
      track: "Believe",
    });
  });

  it("rejects a track without an artist", () => {
    const track = createSpotifyTrack({ artists: [] });

    expect(() => mapSpotifyTrackForLastfm(track)).toThrow(
      "Spotify nie zwrócił nazwy artysty lub utworu"
    );
  });

  it("maps a Spotify track to the public application summary", () => {
    expect(mapSpotifyTrackResponse(createSpotifyTrack())).toEqual({
      id: "track-id",
      name: "Believe",
      artists: ["Cher"],
      album: "Believe",
      durationMs: 240_000,
      spotifyUrl: "https://open.spotify.com/track/track-id",
    });
  });
});

function createSpotifyTrack(
  overrides: Partial<SpotifyTrackApiResponse> = {}
): SpotifyTrackApiResponse {
  return {
    id: "track-id",
    name: "Believe",
    artists: [{ name: "Cher" }],
    album: {
      name: "Believe",
      artists: [{ name: "Cher" }],
      images: [],
    },
    duration_ms: 240_000,
    track_number: 1,
    external_urls: {
      spotify: "https://open.spotify.com/track/track-id",
    },
    ...overrides,
  };
}
