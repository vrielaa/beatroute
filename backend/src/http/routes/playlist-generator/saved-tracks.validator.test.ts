import { describe, expect, it } from "vitest";
import { RequestValidationError } from "@http/request-validation-error.js";
import { parseSavedTracksOffset } from "./saved-tracks.validator.js";

describe("parseSavedTracksOffset", () => {
  it.each([0, 1, 50, 450, 499])("accepts offset %s", (offset) => {
    expect(parseSavedTracksOffset({ offset })).toBe(offset);
  });

  it.each([undefined, null, [], [0], "0", 0, true])(
    "rejects a non-object body: %j",
    (value) => {
      expect(() => parseSavedTracksOffset(value)).toThrow(
        new RequestValidationError(
          "Parametry odczytu zapisanych utworów muszą być obiektem"
        )
      );
    }
  );

  it("requires an explicit offset rather than assuming the first page", () => {
    expect(() => parseSavedTracksOffset({})).toThrow(
      new RequestValidationError("Pole offset jest wymagane")
    );
  });

  it("does not accept an inherited offset", () => {
    expect(() => parseSavedTracksOffset(Object.create({ offset: 0 }))).toThrow(
      RequestValidationError
    );
  });

  it.each([
    undefined,
    null,
    "0",
    "50",
    "",
    true,
    false,
    [],
    {},
    -1,
    500,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects an invalid offset: %s", (offset) => {
    expect(() => parseSavedTracksOffset({ offset })).toThrow(
      new RequestValidationError(
        "Pole offset musi być liczbą całkowitą od 0 do 499"
      )
    );
  });

  it("ignores extra fields without mutating the request", () => {
    const body = Object.freeze({
      offset: 50,
      limit: 500,
      accessToken: "body-token",
      userId: "another-user",
    });

    expect(parseSavedTracksOffset(body)).toBe(50);
    expect(body).toEqual({
      offset: 50,
      limit: 500,
      accessToken: "body-token",
      userId: "another-user",
    });
  });
});
