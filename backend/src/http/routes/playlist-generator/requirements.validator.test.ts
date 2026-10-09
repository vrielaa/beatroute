import { describe, expect, it } from "vitest";
import type { PlaylistRequirements } from "@domain/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import { parsePlaylistGeneratorRequirements } from "./requirements.validator.js";

describe("parsePlaylistGeneratorRequirements", () => {
  it("accepts a tempo range and both numeric maximums", () => {
    const requirements = createRequirements();

    expect(parsePlaylistGeneratorRequirements(requirements)).toEqual(
      requirements
    );
  });

  it.each([
    { tempoRange: null, maxSpeechiness: null, maxLiveness: null },
    { tempoRange: null, maxSpeechiness: 0.33, maxLiveness: 0.8 },
    {
      tempoRange: { min: 120, max: 140 },
      maxSpeechiness: null,
      maxLiveness: null,
    },
    {
      tempoRange: { min: 120, max: 140 },
      maxSpeechiness: 0.33,
      maxLiveness: null,
    },
    {
      tempoRange: { min: 120, max: 140 },
      maxSpeechiness: null,
      maxLiveness: 0.8,
    },
  ])("accepts independently disabled conditions: %j", (requirements) => {
    expect(parsePlaylistGeneratorRequirements(requirements)).toEqual(
      requirements
    );
  });

  it("returns a new object and tempo range without modifying the input", () => {
    const requirements = createRequirements();
    const original = structuredClone(requirements);

    const result = parsePlaylistGeneratorRequirements(requirements);

    expect(result).toEqual(original);
    expect(requirements).toEqual(original);
    expect(result).not.toBe(requirements);
    expect(result.tempoRange).not.toBe(requirements.tempoRange);
  });

  it("does not copy additional fields into the normalized requirements", () => {
    const requirements = {
      ...createRequirements(),
      preferences: { energy: "high" },
      tempoRange: { min: 120, max: 140, unused: true },
    };

    expect(parsePlaylistGeneratorRequirements(requirements)).toEqual(
      createRequirements()
    );
  });

  it.each([undefined, null, [], "requirements", 1, true])(
    "rejects non-object requirements: %j",
    (value) => {
      expect(() => parsePlaylistGeneratorRequirements(value)).toThrow(
        RequestValidationError
      );
    }
  );

  it.each(["tempoRange", "maxSpeechiness", "maxLiveness"])(
    "rejects a missing %s field rather than treating it as disabled",
    (field) => {
      const requirements: Record<string, unknown> = { ...createRequirements() };
      delete requirements[field];

      expect(() => parsePlaylistGeneratorRequirements(requirements)).toThrow(
        `Niepoprawne wymagania playlisty: brak pola ${field}`
      );
    }
  );

  describe("tempoRange", () => {
    it.each([undefined, [], "120-140", 120, true])(
      "rejects a non-object range other than null: %j",
      (tempoRange) => {
        expect(() =>
          parsePlaylistGeneratorRequirements({
            ...createRequirements(),
            tempoRange,
          })
        ).toThrow(RequestValidationError);
      }
    );

    it.each([{}, { min: 120 }, { max: 140 }])(
      "rejects missing range boundaries: %j",
      (tempoRange) => {
        expect(() =>
          parsePlaylistGeneratorRequirements({
            ...createRequirements(),
            tempoRange,
          })
        ).toThrow(
          "Niepoprawne wymagania playlisty: brak pola min lub max w tempoRange"
        );
      }
    );

    describe.each(["min", "max"])("boundary %s", (boundary) => {
      it.each([
        undefined,
        null,
        "120",
        "",
        true,
        [],
        {},
        0,
        -1,
        NaN,
        Infinity,
        -Infinity,
      ])("rejects an invalid boundary: %s", (value) => {
        const tempoRange = { min: 120, max: 140, [boundary]: value };

        expect(() =>
          parsePlaylistGeneratorRequirements({
            ...createRequirements(),
            tempoRange,
          })
        ).toThrow(RequestValidationError);
      });
    });

    it("rejects a minimum greater than the maximum", () => {
      expect(() =>
        parsePlaylistGeneratorRequirements({
          ...createRequirements(),
          tempoRange: { min: 140, max: 120 },
        })
      ).toThrow(
        "Niepoprawne wymagania playlisty: min nie może być większy niż max w tempoRange"
      );
    });

    it.each([
      { min: 120, max: 120 },
      { min: 120.5, max: 140.25 },
      { min: 0.1, max: 0.2 },
    ])("accepts equal or fractional positive boundaries: %j", (tempoRange) => {
      expect(
        parsePlaylistGeneratorRequirements({
          ...createRequirements(),
          tempoRange,
        }).tempoRange
      ).toEqual(tempoRange);
    });
  });

  describe.each(["maxSpeechiness", "maxLiveness"])("maximum %s", (field) => {
    it.each([null, 0, 0.33, 1])("accepts a maximum of %s", (value) => {
      expect(
        parsePlaylistGeneratorRequirements({
          ...createRequirements(),
          [field]: value,
        })
      ).toHaveProperty(field, value);
    });

    it.each([
      undefined,
      "0.8",
      "",
      true,
      [],
      {},
      -0.01,
      1.01,
      NaN,
      Infinity,
      -Infinity,
    ])("rejects an invalid maximum: %s", (value) => {
      expect(() =>
        parsePlaylistGeneratorRequirements({
          ...createRequirements(),
          [field]: value,
        })
      ).toThrow(RequestValidationError);
    });
  });

  it("preserves zero maximums as active conditions rather than converting them to null", () => {
    expect(
      parsePlaylistGeneratorRequirements({
        tempoRange: null,
        maxSpeechiness: 0,
        maxLiveness: 0,
      })
    ).toEqual({
      tempoRange: null,
      maxSpeechiness: 0,
      maxLiveness: 0,
    });
  });
});

function createRequirements(): PlaylistRequirements {
  return {
    tempoRange: { min: 120, max: 140 },
    maxSpeechiness: 0.33,
    maxLiveness: 0.8,
  };
}
