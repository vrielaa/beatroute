import { describe, expect, it } from "vitest";
import { evaluatePlaylistTrack } from "./evaluate-track.js";
import type {
  PlaylistAudioFeatures,
  PlaylistPreferenceFeature,
  PlaylistPreferences,
  PlaylistTrack,
} from "./types.js";

describe("evaluatePlaylistTrack", () => {
  const features: PlaylistPreferenceFeature[] = [
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
  ];

  it.each(features)("evaluates %s independently", (feature) => {
    const track = createTrack({ [feature]: 0.625 });
    const preferences = createPreferences({ [feature]: "high" });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 0.5,
      featureMatches: [
        { feature, level: "high", measurement: 0.625, match: 0.5 },
      ],
    });
  });

  it("uses the selected level for each feature and averages all five matches", () => {
    const track = createTrack({
      energy: 0.625,
      danceability: 0.375,
      valence: 0.5,
      acousticness: 0.25,
      instrumentalness: 0.75,
    });
    const preferences = createPreferences({
      energy: "high",
      danceability: "low",
      valence: "medium",
      acousticness: "low",
      instrumentalness: "high",
    });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 0.8,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.625, match: 0.5 },
        {
          feature: "danceability",
          level: "low",
          measurement: 0.375,
          match: 0.5,
        },
        { feature: "valence", level: "medium", measurement: 0.5, match: 1 },
        { feature: "acousticness", level: "low", measurement: 0.25, match: 1 },
        {
          feature: "instrumentalness",
          level: "high",
          measurement: 0.75,
          match: 1,
        },
      ],
    });
  });

  it("does not include disabled preferences in the explanation or average", () => {
    const track = createTrack({ energy: 0.75 });
    const preferences = createPreferences({ energy: "high" });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 1,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.75, match: 1 },
      ],
    });
  });

  it("returns no score and an empty explanation when all preferences are disabled", () => {
    const track = createTrack();

    expect(evaluatePlaylistTrack(track, createPreferences())).toEqual({
      track,
      overallMatch: null,
      featureMatches: [],
    });
  });

  it("preserves missing measurements and averages only available matches", () => {
    const track = createTrack({
      energy: 0.75,
      danceability: 0.625,
      valence: null,
    });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
      valence: "medium",
    });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 0.75,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.75, match: 1 },
        {
          feature: "danceability",
          level: "high",
          measurement: 0.625,
          match: 0.5,
        },
        { feature: "valence", level: "medium", measurement: null, match: null },
      ],
    });
  });

  it.each(features)(
    "keeps a missing %s measurement as an unscored active preference",
    (feature) => {
      const track = createTrack({ [feature]: null });
      const preferences = createPreferences({ [feature]: "high" });

      expect(evaluatePlaylistTrack(track, preferences)).toEqual({
        track,
        overallMatch: null,
        featureMatches: [
          { feature, level: "high", measurement: null, match: null },
        ],
      });
    }
  );

  it("returns no score but keeps all active preferences when every needed measurement is missing", () => {
    const track = createTrack({
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
      valence: "high",
      acousticness: "high",
      instrumentalness: "high",
    });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: null,
      featureMatches: features.map((feature) => ({
        feature,
        level: "high",
        measurement: null,
        match: null,
      })),
    });
  });

  it("includes zero matches in the average instead of ignoring them", () => {
    const track = createTrack({ energy: 0.75, danceability: 0.25 });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
    });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 0.5,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.75, match: 1 },
        { feature: "danceability", level: "high", measurement: 0.25, match: 0 },
      ],
    });
  });

  it("returns a zero score rather than null when all available matches are zero", () => {
    const track = createTrack({ energy: 0.25, danceability: null });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
    });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 0,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.25, match: 0 },
        {
          feature: "danceability",
          level: "high",
          measurement: null,
          match: null,
        },
      ],
    });
  });

  it("treats a zero measurement as available data", () => {
    const track = createTrack({ energy: 0 });
    const preferences = createPreferences({ energy: "low" });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 1,
      featureMatches: [
        { feature: "energy", level: "low", measurement: 0, match: 1 },
      ],
    });
  });

  it("averages fractional matches without losing the explanation of missing data", () => {
    const track = createTrack({
      energy: 0.7,
      danceability: 0.65,
      valence: null,
    });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
      valence: "medium",
    });

    const result = evaluatePlaylistTrack(track, preferences);

    expect(result.overallMatch).toBeCloseTo(0.7);
    expect(result.featureMatches[0].match).toBeCloseTo(0.8);
    expect(result.featureMatches[1].match).toBeCloseTo(0.6);
    expect(result.featureMatches[2]).toEqual({
      feature: "valence",
      level: "medium",
      measurement: null,
      match: null,
    });
    expect(result.featureMatches).toHaveLength(3);
  });

  it("does not round the overall score", () => {
    const track = createTrack({
      energy: 0.75,
      danceability: 0.25,
      valence: 0.25,
    });
    const preferences = createPreferences({
      energy: "high",
      danceability: "high",
      valence: "high",
    });

    expect(evaluatePlaylistTrack(track, preferences).overallMatch).toBe(1 / 3);
  });

  it("does not evaluate or filter by mandatory requirement features", () => {
    const track = createTrack({
      tempo: null,
      speechiness: 1,
      liveness: 1,
      energy: 0.75,
    });
    const preferences = createPreferences({ energy: "high" });

    expect(evaluatePlaylistTrack(track, preferences)).toEqual({
      track,
      overallMatch: 1,
      featureMatches: [
        { feature: "energy", level: "high", measurement: 0.75, match: 1 },
      ],
    });
  });

  it("does not mutate input and returns the original track reference", () => {
    const track = createTrack({ energy: 0.625, danceability: null });
    const preferences = createPreferences({
      energy: "high",
      danceability: "medium",
    });
    const originalTrack = structuredClone(track);
    const originalPreferences = structuredClone(preferences);
    Object.freeze(track.audioFeatures);
    Object.freeze(track.artists);
    Object.freeze(track);
    Object.freeze(preferences);

    const result = evaluatePlaylistTrack(track, preferences);

    expect(result.track).toBe(track);
    expect(track).toEqual(originalTrack);
    expect(preferences).toEqual(originalPreferences);
  });
});

function createTrack(
  audioFeatures: Partial<PlaylistAudioFeatures> = {}
): PlaylistTrack {
  return {
    id: "track-1",
    name: "Example Track",
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
    energy: null,
    danceability: null,
    valence: null,
    acousticness: null,
    instrumentalness: null,
    ...overrides,
  };
}
