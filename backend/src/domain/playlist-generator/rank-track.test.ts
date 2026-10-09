import { describe, expect, it } from "vitest";
import { rankPlaylistTracks } from "./rank-track.js";
import type {
  PlaylistAudioFeatures,
  PlaylistPreferences,
  PlaylistTrack,
} from "./types.js";

describe("rankPlaylistTracks", () => {
  it("orders tracks by descending preference match", () => {
    const tracks = [
      createTrack("medium-match", { energy: 0.625 }),
      createTrack("zero-match", { energy: 0.25 }),
      createTrack("full-match", { energy: 0.75 }),
    ];

    const result = rankPlaylistTracks(tracks, createPreferences());

    expect(result.map(({ track }) => track.id)).toEqual([
      "full-match",
      "medium-match",
      "zero-match",
    ]);
    expect(result.map(({ overallMatch }) => overallMatch)).toEqual([1, 0.5, 0]);
  });

  it.each(["before", "after"])(
    "places a missing score after zero when its track starts %s the scored tracks",
    (position) => {
      const missing = createTrack("missing", { energy: null });
      const scoredTracks = [
        createTrack("zero", { energy: 0.25 }),
        createTrack("full", { energy: 0.75 }),
      ];
      const tracks =
        position === "before"
          ? [missing, ...scoredTracks]
          : [...scoredTracks, missing];

      const result = rankPlaylistTracks(tracks, createPreferences());

      expect(result.map(({ track }) => track.id)).toEqual([
        "full",
        "zero",
        "missing",
      ]);
      expect(result.map(({ overallMatch }) => overallMatch)).toEqual([
        1,
        0,
        null,
      ]);
    }
  );

  it("preserves source order for equal numeric scores", () => {
    const tracks = [
      createTrack("z-first", { energy: 0.625 }),
      createTrack("a-second", { energy: 0.625 }),
      createTrack("full", { energy: 0.75 }),
      createTrack("m-third", { energy: 0.625 }),
    ];

    const result = rankPlaylistTracks(tracks, createPreferences());

    expect(result.map(({ track }) => track.id)).toEqual([
      "full",
      "z-first",
      "a-second",
      "m-third",
    ]);
  });

  it("preserves source order among unscored tracks after scored tracks", () => {
    const tracks = [
      createTrack("z-missing", { energy: null }),
      createTrack("full", { energy: 0.75 }),
      createTrack("a-missing", { energy: null }),
      createTrack("zero", { energy: 0.25 }),
      createTrack("m-missing", { energy: null }),
    ];

    const result = rankPlaylistTracks(tracks, createPreferences());

    expect(result.map(({ track }) => track.id)).toEqual([
      "full",
      "zero",
      "z-missing",
      "a-missing",
      "m-missing",
    ]);
  });

  it("preserves source order when all needed measurements are missing", () => {
    const tracks = [
      createTrack("z-first", { energy: null }),
      createTrack("a-second", { energy: null }),
      createTrack("m-third", { energy: null }),
    ];

    const result = rankPlaylistTracks(tracks, createPreferences());

    expect(result.map(({ track }) => track)).toEqual(tracks);
    expect(result.map(({ overallMatch }) => overallMatch)).toEqual([
      null,
      null,
      null,
    ]);
    expect(
      result.every(({ featureMatches }) => featureMatches.length === 1)
    ).toBe(true);
  });

  it("preserves source order and returns empty explanations when all preferences are disabled", () => {
    const tracks = [
      createTrack("z-first", { energy: 0.25 }),
      createTrack("a-second", { energy: 0.75 }),
      createTrack("m-third", { energy: null }),
    ];
    const preferences = createPreferences({ energy: null });

    expect(rankPlaylistTracks(tracks, preferences)).toEqual(
      tracks.map((track) => ({ track, overallMatch: null, featureMatches: [] }))
    );
  });

  it("returns an empty ranking for an empty list", () => {
    expect(rankPlaylistTracks([], createPreferences())).toEqual([]);
  });

  it.each([0.625, null])("retains a single track with energy %s", (energy) => {
    const track = createTrack("single", { energy });

    const result = rankPlaylistTracks([track], createPreferences());

    expect(result).toHaveLength(1);
    expect(result[0].track).toBe(track);
    expect(result[0].overallMatch).toBe(energy === null ? null : 0.5);
  });

  it("sorts by the average of active preferences rather than just one feature", () => {
    const tracks = [
      createTrack("high-energy-only", { energy: 0.75, danceability: 0.25 }),
      createTrack("balanced", { energy: 0.625, danceability: 0.625 }),
      createTrack("best-average", { energy: 0.625, danceability: 0.75 }),
    ];
    const preferences = createPreferences({ danceability: "high" });

    const result = rankPlaylistTracks(tracks, preferences);

    expect(result.map(({ track }) => track.id)).toEqual([
      "best-average",
      "high-energy-only",
      "balanced",
    ]);
    expect(result.map(({ overallMatch }) => overallMatch)).toEqual([
      0.75, 0.5, 0.5,
    ]);
  });

  it("ranks a partially measured track by its available average without a completeness penalty", () => {
    const tracks = [
      createTrack("complete", { energy: 0.625, danceability: 0.625 }),
      createTrack("partial", { energy: 0.75, danceability: null }),
    ];
    const preferences = createPreferences({ danceability: "high" });

    const result = rankPlaylistTracks(tracks, preferences);

    expect(result.map(({ track }) => track.id)).toEqual([
      "partial",
      "complete",
    ]);
    expect(result.map(({ overallMatch }) => overallMatch)).toEqual([1, 0.5]);
    expect(result[0].featureMatches).toEqual([
      { feature: "energy", level: "high", measurement: 0.75, match: 1 },
      {
        feature: "danceability",
        level: "high",
        measurement: null,
        match: null,
      },
    ]);
  });

  it("retains the score explanation for every track after sorting", () => {
    const tracks = [
      createTrack("zero", { energy: 0.25 }),
      createTrack("full", { energy: 0.75 }),
    ];

    expect(rankPlaylistTracks(tracks, createPreferences())).toEqual([
      {
        track: tracks[1],
        overallMatch: 1,
        featureMatches: [
          { feature: "energy", level: "high", measurement: 0.75, match: 1 },
        ],
      },
      {
        track: tracks[0],
        overallMatch: 0,
        featureMatches: [
          { feature: "energy", level: "high", measurement: 0.25, match: 0 },
        ],
      },
    ]);
  });

  it("does not mutate input and retains references to all source tracks", () => {
    const tracks = [
      createTrack("zero", { energy: 0.25 }),
      createTrack("full", { energy: 0.75 }),
      createTrack("missing", { energy: null }),
    ];
    const preferences = createPreferences();
    const originalTracks = structuredClone(tracks);
    const originalPreferences = structuredClone(preferences);
    tracks.forEach((track) => {
      Object.freeze(track.audioFeatures);
      Object.freeze(track.artists);
      Object.freeze(track);
    });
    Object.freeze(tracks);
    Object.freeze(preferences);

    const result = rankPlaylistTracks(tracks, preferences);

    expect(tracks).toEqual(originalTracks);
    expect(preferences).toEqual(originalPreferences);
    expect(result).toHaveLength(tracks.length);
    expect(result[0].track).toBe(tracks[1]);
    expect(result[1].track).toBe(tracks[0]);
    expect(result[2].track).toBe(tracks[2]);
  });
});

function createTrack(
  id: string,
  audioFeatures: Partial<PlaylistAudioFeatures> = {}
): PlaylistTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: ["Example Artist"],
    audioFeatures: {
      tempo: 128,
      energy: 0.5,
      danceability: 0.5,
      valence: 0.5,
      acousticness: 0.5,
      instrumentalness: 0.5,
      speechiness: 0.1,
      liveness: 0.1,
      ...audioFeatures,
    },
  };
}

function createPreferences(
  overrides: Partial<PlaylistPreferences> = {}
): PlaylistPreferences {
  return {
    energy: "high",
    danceability: null,
    valence: null,
    acousticness: null,
    instrumentalness: null,
    ...overrides,
  };
}
