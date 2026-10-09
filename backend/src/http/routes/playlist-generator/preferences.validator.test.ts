import { describe, expect, it } from "vitest";
import type {
  PlaylistPreferenceFeature,
  PlaylistPreferenceLevel,
  PlaylistPreferences,
} from "@domain/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import { parsePlaylistPreferences } from "./preferences.validator.js";

describe("parsePlaylistPreferences", () => {
  const features: PlaylistPreferenceFeature[] = [
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
  ];
  const levels: (PlaylistPreferenceLevel | null)[] = [
    "low",
    "medium",
    "high",
    null,
  ];

  it("accepts independently selected levels and disabled preferences", () => {
    const preferences: PlaylistPreferences = {
      energy: "high",
      danceability: "medium",
      valence: "low",
      acousticness: null,
      instrumentalness: "high",
    };

    expect(parsePlaylistPreferences(preferences)).toEqual(preferences);
  });

  it("accepts all preferences disabled explicitly with null", () => {
    const preferences = createPreferences();

    expect(parsePlaylistPreferences(preferences)).toEqual(preferences);
  });

  describe.each(features)("preference %s", (feature) => {
    it.each(levels)("accepts level %s", (level) => {
      const preferences = { ...createPreferences(), [feature]: level };

      expect(parsePlaylistPreferences(preferences)).toEqual(preferences);
    });

    it("rejects a missing field instead of treating it as disabled", () => {
      const preferences: Record<string, unknown> = { ...createPreferences() };
      delete preferences[feature];

      expect(() => parsePlaylistPreferences(preferences)).toThrow(
        RequestValidationError
      );
      expect(() => parsePlaylistPreferences(preferences)).toThrow(
        `Niepoprawne preferencje playlisty: brak pola ${feature}`
      );
    });

    it.each([
      undefined,
      "",
      "HIGH",
      " high ",
      "none",
      0,
      0.5,
      true,
      false,
      [],
      {},
      ["high"],
    ])("rejects an invalid level: %j", (level) => {
      const preferences = { ...createPreferences(), [feature]: level };

      expect(() => parsePlaylistPreferences(preferences)).toThrow(
        RequestValidationError
      );
      expect(() => parsePlaylistPreferences(preferences)).toThrow(
        `Niepoprawne preferencje playlisty: pole ${feature} musi mieć wartość low, medium, high albo null`
      );
    });
  });

  it.each([undefined, null, [], "preferences", "", 1, true, () => null])(
    "rejects non-object preferences: %s",
    (value) => {
      expect(() => parsePlaylistPreferences(value)).toThrow(
        RequestValidationError
      );
      expect(() => parsePlaylistPreferences(value)).toThrow(
        "Niepoprawne preferencje playlisty: muszą być obiektem"
      );
    }
  );

  it("rejects an empty object rather than applying default preferences", () => {
    expect(() => parsePlaylistPreferences({})).toThrow(RequestValidationError);
  });

  it("does not accept an inherited field in place of a supplied preference", () => {
    const preferences: Record<string, unknown> = { ...createPreferences() };
    delete preferences.energy;
    Object.setPrototypeOf(preferences, { energy: "high" });

    expect(() => parsePlaylistPreferences(preferences)).toThrow(
      "Niepoprawne preferencje playlisty: brak pola energy"
    );
  });

  it("does not copy additional fields into the normalized preferences", () => {
    const preferences = {
      ...createPreferences(),
      tempo: "high",
      requirements: { tempoRange: { min: 120, max: 140 } },
      unused: true,
    };

    expect(parsePlaylistPreferences(preferences)).toEqual(createPreferences());
  });

  it("returns a new object without modifying input", () => {
    const preferences: PlaylistPreferences = {
      ...createPreferences(),
      energy: "high",
      danceability: "low",
    };
    const original = structuredClone(preferences);
    Object.freeze(preferences);

    const result = parsePlaylistPreferences(preferences);

    expect(result).toEqual(original);
    expect(result).not.toBe(preferences);
    expect(preferences).toEqual(original);
  });
});

function createPreferences(): PlaylistPreferences {
  return {
    energy: null,
    danceability: null,
    valence: null,
    acousticness: null,
    instrumentalness: null,
  };
}
