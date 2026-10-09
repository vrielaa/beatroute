import { describe, expect, it } from "vitest";
import type {
  PlaylistAudioFeatures,
  PlaylistRequirements,
  PlaylistTrack,
} from "./types.js";
import { filterPlaylistTracks } from "./filter-tracks.js";

describe("filterPlaylistTracks", () => {
  it("accepts a track that meets all active requirements", () => {
    const track = createTrack();

    expect(filterPlaylistTracks([track], createRequirements())).toEqual({
      acceptedTracks: [track],
      rejectedTracks: [],
    });
  });

  it.each([120, 128, 140])(
    "accepts tempo %s inside the inclusive range",
    (tempo) => {
      const track = createTrack("track-1", { tempo });

      expect(
        filterPlaylistTracks([track], createRequirements()).acceptedTracks
      ).toEqual([track]);
    }
  );

  it.each([119.99, 140.01])("rejects tempo %s outside the range", (tempo) => {
    const track = createTrack("track-1", { tempo });

    expect(filterPlaylistTracks([track], createRequirements())).toEqual({
      acceptedTracks: [],
      rejectedTracks: [
        { track, reasons: [{ feature: "tempo", code: "outside-range" }] },
      ],
    });
  });

  it("rejects a missing tempo when the range is active", () => {
    const track = createTrack("track-1", { tempo: null });

    expect(
      filterPlaylistTracks([track], createRequirements()).rejectedTracks
    ).toEqual([
      { track, reasons: [{ feature: "tempo", code: "missing-measurement" }] },
    ]);
  });

  it("accepts exactly the tempo required by an equal-boundary range", () => {
    const track = createTrack("track-1", { tempo: 130 });
    const requirements = createRequirements({
      tempoRange: { min: 130, max: 130 },
    });

    expect(filterPlaylistTracks([track], requirements).acceptedTracks).toEqual([
      track,
    ]);
  });

  it.each([129.99, 130.01])(
    "rejects tempo %s outside an equal-boundary range",
    (tempo) => {
      const track = createTrack("track-1", { tempo });
      const requirements = createRequirements({
        tempoRange: { min: 130, max: 130 },
      });

      expect(
        filterPlaylistTracks([track], requirements).rejectedTracks
      ).toEqual([
        { track, reasons: [{ feature: "tempo", code: "outside-range" }] },
      ]);
    }
  );

  it.each([100, null])(
    "ignores tempo %s when its range is disabled",
    (tempo) => {
      const track = createTrack("track-1", { tempo });
      const requirements = createRequirements({ tempoRange: null });

      expect(filterPlaylistTracks([track], requirements)).toEqual({
        acceptedTracks: [track],
        rejectedTracks: [],
      });
    }
  );

  describe("speechiness", () => {
    it.each([0, 0.33])(
      "accepts a measurement of %s at or below the maximum",
      (speechiness) => {
        const track = createTrack("track-1", { speechiness });

        expect(
          filterPlaylistTracks([track], createRequirements()).acceptedTracks
        ).toEqual([track]);
      }
    );

    it("rejects a measurement above the maximum", () => {
      const track = createTrack("track-1", { speechiness: 0.331 });

      expect(
        filterPlaylistTracks([track], createRequirements()).rejectedTracks
      ).toEqual([
        { track, reasons: [{ feature: "speechiness", code: "above-maximum" }] },
      ]);
    });

    it("reports a missing measurement for an active maximum", () => {
      const track = createTrack("track-1", { speechiness: null });

      expect(
        filterPlaylistTracks([track], createRequirements()).rejectedTracks
      ).toEqual([
        {
          track,
          reasons: [{ feature: "speechiness", code: "missing-measurement" }],
        },
      ]);
    });

    it.each([0.9, null])(
      "ignores a measurement of %s when the maximum is disabled",
      (speechiness) => {
        const track = createTrack("track-1", { speechiness });
        const requirements = createRequirements({ maxSpeechiness: null });

        expect(filterPlaylistTracks([track], requirements)).toEqual({
          acceptedTracks: [track],
          rejectedTracks: [],
        });
      }
    );
  });

  describe("liveness", () => {
    it.each([0, 0.8])(
      "accepts a measurement of %s at or below the maximum",
      (liveness) => {
        const track = createTrack("track-1", { liveness });

        expect(
          filterPlaylistTracks([track], createRequirements()).acceptedTracks
        ).toEqual([track]);
      }
    );

    it("rejects a measurement above the maximum", () => {
      const track = createTrack("track-1", { liveness: 0.801 });

      expect(
        filterPlaylistTracks([track], createRequirements()).rejectedTracks
      ).toEqual([
        { track, reasons: [{ feature: "liveness", code: "above-maximum" }] },
      ]);
    });

    it("reports a missing measurement for an active maximum", () => {
      const track = createTrack("track-1", { liveness: null });

      expect(
        filterPlaylistTracks([track], createRequirements()).rejectedTracks
      ).toEqual([
        {
          track,
          reasons: [{ feature: "liveness", code: "missing-measurement" }],
        },
      ]);
    });

    it.each([0.9, null])(
      "ignores a measurement of %s when the maximum is disabled",
      (liveness) => {
        const track = createTrack("track-1", { liveness });
        const requirements = createRequirements({ maxLiveness: null });

        expect(filterPlaylistTracks([track], requirements)).toEqual({
          acceptedTracks: [track],
          rejectedTracks: [],
        });
      }
    );
  });

  it("accepts zero measurements when both maximums are zero", () => {
    const track = createTrack("track-1", { speechiness: 0, liveness: 0 });
    const requirements = createRequirements({
      maxSpeechiness: 0,
      maxLiveness: 0,
    });

    expect(filterPlaylistTracks([track], requirements)).toEqual({
      acceptedTracks: [track],
      rejectedTracks: [],
    });
  });

  it("treats zero maximums as active conditions and rejects positive measurements", () => {
    const track = createTrack("track-1", { speechiness: 0.01, liveness: 0.01 });
    const requirements = createRequirements({
      maxSpeechiness: 0,
      maxLiveness: 0,
    });

    expect(filterPlaylistTracks([track], requirements)).toEqual({
      acceptedTracks: [],
      rejectedTracks: [
        {
          track,
          reasons: [
            { feature: "speechiness", code: "above-maximum" },
            { feature: "liveness", code: "above-maximum" },
          ],
        },
      ],
    });
  });

  it("reports missing measurements rather than treating them as zero", () => {
    const track = createTrack("track-1", { speechiness: null, liveness: null });
    const requirements = createRequirements({
      maxSpeechiness: 0,
      maxLiveness: 0,
    });

    expect(filterPlaylistTracks([track], requirements).rejectedTracks).toEqual([
      {
        track,
        reasons: [
          { feature: "speechiness", code: "missing-measurement" },
          { feature: "liveness", code: "missing-measurement" },
        ],
      },
    ]);
  });

  it("collects all violations rather than stopping at the first one", () => {
    const track = createTrack("track-1", {
      tempo: 100,
      speechiness: 0.5,
      liveness: 0.9,
    });

    expect(filterPlaylistTracks([track], createRequirements())).toEqual({
      acceptedTracks: [],
      rejectedTracks: [
        {
          track,
          reasons: [
            { feature: "tempo", code: "outside-range" },
            { feature: "speechiness", code: "above-maximum" },
            { feature: "liveness", code: "above-maximum" },
          ],
        },
      ],
    });
  });

  it("collects all missing measurements needed by active conditions", () => {
    const track = createTrack("track-1", {
      tempo: null,
      speechiness: null,
      liveness: null,
    });

    expect(
      filterPlaylistTracks([track], createRequirements()).rejectedTracks
    ).toEqual([
      {
        track,
        reasons: [
          { feature: "tempo", code: "missing-measurement" },
          { feature: "speechiness", code: "missing-measurement" },
          { feature: "liveness", code: "missing-measurement" },
        ],
      },
    ]);
  });

  it("distinguishes missing measurements from exceeded limits on the same track", () => {
    const track = createTrack("track-1", {
      tempo: null,
      speechiness: 0.5,
      liveness: null,
    });

    expect(
      filterPlaylistTracks([track], createRequirements()).rejectedTracks
    ).toEqual([
      {
        track,
        reasons: [
          { feature: "tempo", code: "missing-measurement" },
          { feature: "speechiness", code: "above-maximum" },
          { feature: "liveness", code: "missing-measurement" },
        ],
      },
    ]);
  });

  it("accepts tracks with missing measurements when all conditions are disabled", () => {
    const tracks = [
      createTrack(),
      createTrack("track-2", {
        tempo: null,
        speechiness: null,
        liveness: null,
      }),
    ];
    const requirements = createRequirements({
      tempoRange: null,
      maxSpeechiness: null,
      maxLiveness: null,
    });

    expect(filterPlaylistTracks(tracks, requirements)).toEqual({
      acceptedTracks: tracks,
      rejectedTracks: [],
    });
  });

  it("does not use fuzzy preference features as mandatory conditions", () => {
    const track = createTrack("track-1", {
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    });

    expect(filterPlaylistTracks([track], createRequirements())).toEqual({
      acceptedTracks: [track],
      rejectedTracks: [],
    });
  });

  it("preserves source order and assigns each track to exactly one group", () => {
    const tracks = [
      createTrack("accepted-1"),
      createTrack("rejected-1", { tempo: 100 }),
      createTrack("accepted-2", { tempo: 140 }),
      createTrack("rejected-2", { liveness: null }),
    ];

    const result = filterPlaylistTracks(tracks, createRequirements());

    expect(result.acceptedTracks.map((track) => track.id)).toEqual([
      "accepted-1",
      "accepted-2",
    ]);
    expect(result.rejectedTracks.map(({ track }) => track.id)).toEqual([
      "rejected-1",
      "rejected-2",
    ]);
    expect(result.acceptedTracks.length + result.rejectedTracks.length).toBe(
      tracks.length
    );
    expect(
      result.rejectedTracks.every(({ reasons }) => reasons.length > 0)
    ).toBe(true);
  });

  it("returns empty groups for an empty input", () => {
    expect(filterPlaylistTracks([], createRequirements())).toEqual({
      acceptedTracks: [],
      rejectedTracks: [],
    });
  });

  it("does not mutate tracks or requirements and retains the original track references", () => {
    const tracks = [
      createTrack("accepted"),
      createTrack("rejected", { tempo: 100 }),
    ];
    const requirements = createRequirements();
    const originalTracks = structuredClone(tracks);
    const originalRequirements = structuredClone(requirements);

    tracks.forEach((track) => {
      Object.freeze(track.artists);
      Object.freeze(track.audioFeatures);
      Object.freeze(track);
    });
    Object.freeze(tracks);
    Object.freeze(requirements.tempoRange);
    Object.freeze(requirements);

    const result = filterPlaylistTracks(tracks, requirements);

    expect(tracks).toEqual(originalTracks);
    expect(requirements).toEqual(originalRequirements);
    expect(result.acceptedTracks).not.toBe(tracks);
    expect(result.acceptedTracks[0]).toBe(tracks[0]);
    expect(result.rejectedTracks[0].track).toBe(tracks[1]);
  });
});

function createTrack(
  id = "track-1",
  audioFeatures: Partial<PlaylistAudioFeatures> = {}
): PlaylistTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: ["Artist"],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.75,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0.05,
      speechiness: 0.04,
      liveness: 0.15,
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
