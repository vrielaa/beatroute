import { describe, expect, it } from "vitest";
import { generatePlaylist } from "./generate-playlist.js";
import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
  PlaylistPreferences,
  PlaylistRequirements,
  PlaylistTrack,
} from "./types.js";

describe("generatePlaylist", () => {
  it.each([
    { feature: "tempo", audioFeatures: { tempo: 110 }, code: "outside-range" },
    {
      feature: "speechiness",
      audioFeatures: { speechiness: 0.4 },
      code: "above-maximum",
    },
    {
      feature: "liveness",
      audioFeatures: { liveness: 0.9 },
      code: "above-maximum",
    },
  ])(
    "does not restore a track rejected by $feature even with a perfect preference match",
    ({ feature, audioFeatures, code }) => {
      const rejected = createTrack("perfect-match-but-rejected", {
        energy: 0.9,
        ...audioFeatures,
      });
      const accepted = createTrack("accepted-with-zero-match", {
        energy: 0.25,
      });
      const dataset = createDataset([rejected, accepted]);

      const result = generatePlaylist(
        dataset,
        createRequirements(),
        createPreferences()
      );

      expect(result).toEqual({
        rankedTracks: [
          {
            track: accepted,
            overallMatch: 0,
            featureMatches: [
              { feature: "energy", level: "high", measurement: 0.25, match: 0 },
            ],
          },
        ],
        rejectedTracks: [{ track: rejected, reasons: [{ feature, code }] }],
      });
    }
  );

  it("returns an empty playlist and all rejection reasons when every track is rejected", () => {
    const outsideRange = createTrack("outside-range", {
      tempo: 100,
      energy: 0.9,
    });
    const missingTempo = createTrack("missing-tempo", {
      tempo: null,
      energy: 0.9,
    });

    const result = generatePlaylist(
      createDataset([outsideRange, missingTempo]),
      createRequirements(),
      createPreferences()
    );

    expect(result).toEqual({
      rankedTracks: [],
      rejectedTracks: [
        {
          track: outsideRange,
          reasons: [{ feature: "tempo", code: "outside-range" }],
        },
        {
          track: missingTempo,
          reasons: [{ feature: "tempo", code: "missing-measurement" }],
        },
      ],
    });
  });

  it("still filters requirements and preserves accepted source order with no active preferences", () => {
    const first = createTrack("first", { energy: 0.25 });
    const rejected = createTrack("rejected", { tempo: 100 });
    const second = createTrack("second", { energy: 0.9 });
    const preferences = createPreferences({ energy: null });

    const result = generatePlaylist(
      createDataset([first, rejected, second]),
      createRequirements(),
      preferences
    );

    expect(result).toEqual({
      rankedTracks: [
        { track: first, overallMatch: null, featureMatches: [] },
        { track: second, overallMatch: null, featureMatches: [] },
      ],
      rejectedTracks: [
        {
          track: rejected,
          reasons: [{ feature: "tempo", code: "outside-range" }],
        },
      ],
    });
  });

  it("keeps partial and missing preference measurements without confusing them with missing required measurements", () => {
    const unscored = createTrack("unscored", {
      energy: null,
      danceability: null,
    });
    const partial = createTrack("partial", {
      energy: 0.625,
      danceability: null,
    });
    const rejected = createTrack("missing-required-tempo", {
      tempo: null,
      energy: 0.9,
    });
    const preferences = createPreferences({ danceability: "high" });

    const result = generatePlaylist(
      createDataset([unscored, partial, rejected]),
      createRequirements(),
      preferences
    );

    expect(result).toEqual({
      rankedTracks: [
        {
          track: partial,
          overallMatch: 0.5,
          featureMatches: [
            {
              feature: "energy",
              level: "high",
              measurement: 0.625,
              match: 0.5,
            },
            {
              feature: "danceability",
              level: "high",
              measurement: null,
              match: null,
            },
          ],
        },
        {
          track: unscored,
          overallMatch: null,
          featureMatches: [
            {
              feature: "energy",
              level: "high",
              measurement: null,
              match: null,
            },
            {
              feature: "danceability",
              level: "high",
              measurement: null,
              match: null,
            },
          ],
        },
      ],
      rejectedTracks: [
        {
          track: rejected,
          reasons: [{ feature: "tempo", code: "missing-measurement" }],
        },
      ],
    });
  });

  it("retains every rejection reason and source order of rejected tracks", () => {
    const firstRejected = createTrack("first-rejected", {
      tempo: 110,
      speechiness: 0.4,
      liveness: null,
    });
    const accepted = createTrack("accepted");
    const secondRejected = createTrack("second-rejected", { tempo: null });

    const result = generatePlaylist(
      createDataset([firstRejected, accepted, secondRejected]),
      createRequirements(),
      createPreferences()
    );

    expect(result.rankedTracks.map(({ track }) => track)).toEqual([accepted]);
    expect(result.rejectedTracks).toEqual([
      {
        track: firstRejected,
        reasons: [
          { feature: "tempo", code: "outside-range" },
          { feature: "speechiness", code: "above-maximum" },
          { feature: "liveness", code: "missing-measurement" },
        ],
      },
      {
        track: secondRejected,
        reasons: [{ feature: "tempo", code: "missing-measurement" }],
      },
    ]);
  });

  it("allows missing requirement measurements when every requirement is disabled", () => {
    const track = createTrack("no-measurements", {
      tempo: null,
      speechiness: null,
      liveness: null,
      energy: null,
    });
    const requirements = createRequirements({
      tempoRange: null,
      maxSpeechiness: null,
      maxLiveness: null,
    });

    expect(
      generatePlaylist(
        createDataset([track]),
        requirements,
        createPreferences()
      )
    ).toEqual({
      rankedTracks: [
        {
          track,
          overallMatch: null,
          featureMatches: [
            {
              feature: "energy",
              level: "high",
              measurement: null,
              match: null,
            },
          ],
        },
      ],
      rejectedTracks: [],
    });
  });

  it("ranks all accepted tracks and preserves source order for ties", () => {
    const firstTie = createTrack("z-first", { energy: 0.625 });
    const zero = createTrack("zero", { energy: 0.25 });
    const best = createTrack("best", { energy: 0.75 });
    const secondTie = createTrack("a-second", { energy: 0.625 });

    const result = generatePlaylist(
      createDataset([firstTie, zero, best, secondTie]),
      createRequirements(),
      createPreferences()
    );

    expect(result.rankedTracks.map(({ track }) => track.id)).toEqual([
      "best",
      "z-first",
      "a-second",
      "zero",
    ]);
    expect(result.rankedTracks.map(({ overallMatch }) => overallMatch)).toEqual(
      [1, 0.5, 0.5, 0]
    );
    expect(result.rejectedTracks).toEqual([]);
  });

  it("does not mutate input and assigns every source track to exactly one result group", () => {
    const dataset = createDataset([
      createTrack("zero", { energy: 0.25 }),
      createTrack("rejected", { tempo: 110, energy: 0.9 }),
      createTrack("best", { energy: 0.75 }),
    ]);
    const requirements = createRequirements();
    const preferences = createPreferences();
    const originalInputs = structuredClone({
      dataset,
      requirements,
      preferences,
    });
    dataset.tracks.forEach((track) => {
      Object.freeze(track.audioFeatures);
      Object.freeze(track.artists);
      Object.freeze(track);
    });
    Object.freeze(dataset.tracks);
    Object.freeze(dataset);
    Object.freeze(requirements.tempoRange);
    Object.freeze(requirements);
    Object.freeze(preferences);

    const result = generatePlaylist(dataset, requirements, preferences);

    expect({ dataset, requirements, preferences }).toEqual(originalInputs);
    expect(result.rankedTracks[0].track).toBe(dataset.tracks[2]);
    expect(result.rankedTracks[1].track).toBe(dataset.tracks[0]);
    expect(result.rejectedTracks[0].track).toBe(dataset.tracks[1]);
    const resultIds = [
      ...result.rankedTracks.map(({ track }) => track.id),
      ...result.rejectedTracks.map(({ track }) => track.id),
    ];
    expect(resultIds).toHaveLength(dataset.tracks.length);
    expect(new Set(resultIds)).toEqual(
      new Set(dataset.tracks.map(({ id }) => id))
    );
  });
});

function createDataset(tracks: PlaylistTrack[]): PlaylistDataset {
  return { version: 1, tracks };
}

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

function createRequirements(
  overrides: Partial<PlaylistRequirements> = {}
): PlaylistRequirements {
  return {
    tempoRange: { min: 120, max: 140 },
    maxSpeechiness: 0.33,
    maxLiveness: 0.8,
    ...overrides,
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
