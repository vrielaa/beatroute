import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
  PlaylistTrack,
} from "@domain/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import { parsePlaylistGeneratorDataset } from "./dataset.validator.js";

describe("parsePlaylistGeneratorDataset", () => {
  it("accepts the documented synthetic sample file", () => {
    const value: unknown = JSON.parse(
      readFileSync(
        new URL(
          "../../../../../examples/playlist-dataset.json",
          import.meta.url
        ),
        "utf8"
      )
    );

    const result = parsePlaylistGeneratorDataset(value);

    expect(result).toEqual(value);
    expect(result.tracks).toHaveLength(6);
  });

  it("returns a new dataset without modifying its input", () => {
    const dataset = createDataset();
    const original = structuredClone(dataset);

    const result = parsePlaylistGeneratorDataset(dataset);

    expect(result).toEqual(original);
    expect(dataset).toEqual(original);
    expect(result).not.toBe(dataset);
    expect(result.tracks).not.toBe(dataset.tracks);
    expect(result.tracks[0]).not.toBe(dataset.tracks[0]);
    expect(result.tracks[0].artists).not.toBe(dataset.tracks[0].artists);
    expect(result.tracks[0].audioFeatures).not.toBe(
      dataset.tracks[0].audioFeatures
    );
  });

  it("trims identifiers, track names and artist names", () => {
    const track = {
      ...createTrack(),
      id: "  track-1  ",
      name: "  Track 1  ",
      artists: ["  Artist A ", " Artist B  "],
    };

    const result = parsePlaylistGeneratorDataset(createDataset([track]));

    expect(result.tracks[0]).toEqual({
      ...createTrack(),
      artists: ["Artist A", "Artist B"],
    });
    expect(track.id).toBe("  track-1  ");
    expect(track.artists).toEqual(["  Artist A ", " Artist B  "]);
  });

  it("does not copy additional fields into the normalized dataset", () => {
    const track = createTrack();
    const result = parsePlaylistGeneratorDataset({
      ...createDataset(),
      preferences: { energy: "high" },
      tracks: [
        {
          ...track,
          provider: "example",
          audioFeatures: { ...track.audioFeatures, unusedFeature: 0.5 },
        },
      ],
    });

    expect(result).toEqual(createDataset());
  });

  it.each([undefined, null, [], "dataset", 1, true])(
    "rejects a non-object dataset: %j",
    (value) => {
      expect(() => parsePlaylistGeneratorDataset(value)).toThrow(
        RequestValidationError
      );
    }
  );

  it.each([undefined, null, "1", 0, 2, true, [], {}])(
    "rejects an unsupported version: %j",
    (version) => {
      expect(() =>
        parsePlaylistGeneratorDataset({ ...createDataset(), version })
      ).toThrow("Nieobsługiwana wersja zbioru playlist");
    }
  );

  it.each([undefined, null, "tracks", 1, true, {}])(
    "rejects a non-array tracks value: %j",
    (tracks) => {
      expect(() =>
        parsePlaylistGeneratorDataset({ version: 1, tracks })
      ).toThrow(RequestValidationError);
    }
  );

  it("rejects an empty track list", () => {
    expect(() => parsePlaylistGeneratorDataset(createDataset([]))).toThrow(
      'Pole "dataset.tracks" nie może być pustą tablicą'
    );
  });

  it("accepts exactly 500 tracks", () => {
    const tracks = Array.from({ length: 500 }, (_, index) =>
      createTrack(`track-${index}`)
    );

    expect(
      parsePlaylistGeneratorDataset(createDataset(tracks)).tracks
    ).toHaveLength(500);
  });

  it("rejects 501 tracks", () => {
    const tracks = Array.from({ length: 501 }, (_, index) =>
      createTrack(`track-${index}`)
    );

    expect(() => parsePlaylistGeneratorDataset(createDataset(tracks))).toThrow(
      'Pole "dataset.tracks" nie może przekraczać limitu 500'
    );
  });

  it.each([undefined, null, [], "track", 1, true])(
    "rejects a non-object track: %j",
    (track) => {
      expect(() =>
        parsePlaylistGeneratorDataset({ version: 1, tracks: [track] })
      ).toThrow(RequestValidationError);
    }
  );

  describe.each(["id", "name"])("track %s", (field) => {
    it.each([undefined, null, "", "   ", 1, true, [], {}])(
      "rejects an invalid text value: %j",
      (value) => {
        const track = { ...createTrack(), [field]: value };

        expect(() =>
          parsePlaylistGeneratorDataset({ version: 1, tracks: [track] })
        ).toThrow(RequestValidationError);
      }
    );
  });

  it.each(["track-1", "  track-1  "])(
    "rejects duplicate identifiers after trimming: %j",
    (id) => {
      const tracks = [createTrack(), createTrack(id)];

      expect(() =>
        parsePlaylistGeneratorDataset(createDataset(tracks))
      ).toThrow("Identyfikatory utworów muszą być unikalne");
    }
  );

  it("does not retain identifiers between separate validations", () => {
    expect(parsePlaylistGeneratorDataset(createDataset())).toEqual(
      createDataset()
    );
    expect(parsePlaylistGeneratorDataset(createDataset())).toEqual(
      createDataset()
    );
  });

  it.each([
    undefined,
    null,
    [],
    "Artist",
    1,
    true,
    {},
    [null],
    [1],
    [""],
    ["   "],
    ["Artist", 1],
  ])("rejects invalid artist lists: %j", (artists) => {
    const track = { ...createTrack(), artists };

    expect(() =>
      parsePlaylistGeneratorDataset({ version: 1, tracks: [track] })
    ).toThrow(RequestValidationError);
  });

  it.each([undefined, null, [], "features", 1, true])(
    "rejects a non-object audio features value: %j",
    (audioFeatures) => {
      const track = { ...createTrack(), audioFeatures };

      expect(() =>
        parsePlaylistGeneratorDataset({ version: 1, tracks: [track] })
      ).toThrow(RequestValidationError);
    }
  );

  it("accepts all-null measurements without converting them to zero", () => {
    const audioFeatures: PlaylistAudioFeatures = {
      tempo: null,
      energy: null,
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
      speechiness: null,
      liveness: null,
    };
    const track = { ...createTrack(), audioFeatures };

    expect(
      parsePlaylistGeneratorDataset(createDataset([track])).tracks[0]
        .audioFeatures
    ).toEqual(audioFeatures);
  });

  it.each([null, 0.1, 120, 140, 128.5])("accepts tempo %j", (tempo) => {
    const track = createTrack();
    track.audioFeatures.tempo = tempo;

    expect(
      parsePlaylistGeneratorDataset(createDataset([track])).tracks[0]
        .audioFeatures.tempo
    ).toBe(tempo);
  });

  it.each([
    undefined,
    "128",
    "",
    0,
    -1,
    NaN,
    Infinity,
    -Infinity,
    true,
    [],
    {},
  ])("rejects invalid tempo %j", (tempo) => {
    expect(() =>
      parsePlaylistGeneratorDataset(datasetWithFeature("tempo", tempo))
    ).toThrow(RequestValidationError);
  });

  describe.each([
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
  ])("audio feature %s", (feature) => {
    it.each([null, 0, 0.5, 1])("accepts a measurement of %j", (value) => {
      expect(
        parsePlaylistGeneratorDataset(datasetWithFeature(feature, value))
          .tracks[0].audioFeatures
      ).toHaveProperty(feature, value);
    });

    it.each([
      undefined,
      "0.8",
      -0.01,
      1.01,
      NaN,
      Infinity,
      -Infinity,
      true,
      [],
      {},
    ])("rejects an invalid measurement of %j", (value) => {
      expect(() =>
        parsePlaylistGeneratorDataset(datasetWithFeature(feature, value))
      ).toThrow(RequestValidationError);
    });
  });

  it.each([
    "tempo",
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
  ])(
    "rejects an absent %s field rather than filling it with null",
    (feature) => {
      const audioFeatures: Record<string, unknown> = {
        ...createTrack().audioFeatures,
      };
      delete audioFeatures[feature];

      expect(() =>
        parsePlaylistGeneratorDataset({
          version: 1,
          tracks: [{ ...createTrack(), audioFeatures }],
        })
      ).toThrow(RequestValidationError);
    }
  );
});

function createTrack(id = "track-1"): PlaylistTrack {
  return {
    id,
    name: "Track 1",
    artists: ["Artist A"],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.75,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0.05,
      speechiness: 0.04,
      liveness: 0.15,
    },
  };
}

function createDataset(
  tracks: PlaylistTrack[] = [createTrack()]
): PlaylistDataset {
  return { version: 1, tracks };
}

function datasetWithFeature(feature: string, value: unknown): unknown {
  const track = createTrack();
  return {
    version: 1,
    tracks: [
      { ...track, audioFeatures: { ...track.audioFeatures, [feature]: value } },
    ],
  };
}
