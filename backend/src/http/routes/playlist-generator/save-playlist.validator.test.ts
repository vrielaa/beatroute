import { describe, expect, it } from "vitest";
import { RequestValidationError } from "@http/request-validation-error.js";
import { parsePlaylistToSave } from "./save-playlist.validator.js";

describe("parsePlaylistToSave", () => {
  const firstId = "3sNVsP50132BTNlImLx70i";
  const secondId = "4U4LEUWV8sFtos5PdjfDA7";

  it("accepts a playlist name and selected track IDs", () => {
    const playlist = {
      name: "Na siłownię",
      trackIds: [firstId, secondId],
    };
    const value: unknown = JSON.parse(JSON.stringify(playlist));

    expect(parsePlaylistToSave(value)).toEqual(playlist);
  });

  it("accepts a single-character name and a single track", () => {
    const playlist = { name: "A", trackIds: [firstId] };

    expect(parsePlaylistToSave(playlist)).toEqual(playlist);
  });

  it("trims the name and IDs without changing their order or case", () => {
    expect(
      parsePlaylistToSave({
        name: " \tNa siłownię\n ",
        trackIds: [" " + secondId + " ", "\n" + firstId + "\t"],
      })
    ).toEqual({
      name: "Na siłownię",
      trackIds: [secondId, firstId],
    });
  });

  it("accepts a name with exactly 100 characters", () => {
    const name = "A".repeat(100);

    expect(parsePlaylistToSave({ name, trackIds: [firstId] }).name).toBe(name);
  });

  it("checks name length after trimming whitespace", () => {
    const name = "A".repeat(100);

    expect(
      parsePlaylistToSave({ name: " " + name + " ", trackIds: [firstId] }).name
    ).toBe(name);
  });

  it("rejects a name with 101 characters", () => {
    expect(() =>
      parsePlaylistToSave({ name: "A".repeat(101), trackIds: [firstId] })
    ).toThrow("Nazwa playlisty może mieć maksymalnie 100 znaków");
  });

  it("accepts exactly 500 unique identifiers", () => {
    const trackIds = Array.from({ length: 500 }, (_, index) =>
      index.toString(36).padStart(22, "0")
    );

    expect(
      parsePlaylistToSave({ name: "Playlist", trackIds }).trackIds
    ).toEqual(trackIds);
  });

  it("rejects an empty track list", () => {
    expect(() =>
      parsePlaylistToSave({ name: "Playlist", trackIds: [] })
    ).toThrow(
      "Pole trackIds musi zawierać od 1 do 500 identyfikatorów utworów"
    );
  });

  it("rejects a list containing 501 tracks", () => {
    const trackIds = Array.from({ length: 501 }, (_, index) =>
      index.toString(36).padStart(22, "0")
    );

    expect(() => parsePlaylistToSave({ name: "Playlist", trackIds })).toThrow(
      "Pole trackIds musi zawierać od 1 do 500 identyfikatorów utworów"
    );
  });

  it.each([undefined, null, [], "playlist", 1, true])(
    "rejects a non-object payload: %j",
    (value) => {
      expect(() => parsePlaylistToSave(value)).toThrow(RequestValidationError);
      expect(() => parsePlaylistToSave(value)).toThrow(
        "Dane do zapisu playlisty muszą być obiektem"
      );
    }
  );

  it("requires the name field", () => {
    expect(() => parsePlaylistToSave({ trackIds: [firstId] })).toThrow(
      "Pole name jest wymagane"
    );
  });

  it("requires the trackIds field", () => {
    expect(() => parsePlaylistToSave({ name: "Playlist" })).toThrow(
      "Pole trackIds jest wymagane"
    );
  });

  it.each([undefined, null, "", " \t\n ", 1, true, [], {}])(
    "rejects an invalid name: %j",
    (name) => {
      expect(() => parsePlaylistToSave({ name, trackIds: [firstId] })).toThrow(
        RequestValidationError
      );
      expect(() => parsePlaylistToSave({ name, trackIds: [firstId] })).toThrow(
        "Pole name musi być niepustym tekstem"
      );
    }
  );

  it.each([undefined, null, "ids", 1, true, {}])(
    "rejects a non-array ID list: %j",
    (trackIds) => {
      expect(() => parsePlaylistToSave({ name: "Playlist", trackIds })).toThrow(
        "Pole trackIds musi być tablicą"
      );
    }
  );

  it.each([undefined, null, 1, true, [], {}])(
    "rejects a non-string ID: %j",
    (id) => {
      expect(() =>
        parsePlaylistToSave({ name: "Playlist", trackIds: [id] })
      ).toThrow("Pole trackIds[0] musi być tekstowym identyfikatorem Spotify");
    }
  );

  it.each([
    "",
    "   ",
    "track-001",
    "A".repeat(21),
    "A".repeat(23),
    "A".repeat(21) + "_",
    "A".repeat(21) + "-",
    "A".repeat(21) + "ą",
    "A".repeat(10) + " " + "A".repeat(11),
    "https://open.spotify.com/track/" + firstId,
    "spotify:track:" + firstId,
  ])("rejects an invalid Spotify ID: %j", (id) => {
    expect(() =>
      parsePlaylistToSave({ name: "Playlist", trackIds: [id] })
    ).toThrow("Spotify ID złożone z 22 liter lub cyfr");
  });

  it("identifies the position of an invalid ID", () => {
    expect(() =>
      parsePlaylistToSave({
        name: "Playlist",
        trackIds: [firstId, "invalid"],
      })
    ).toThrow("Pole trackIds[1]");
  });

  it("rejects a sparse list rather than skipping a missing ID", () => {
    expect(() =>
      parsePlaylistToSave({ name: "Playlist", trackIds: Array(1) })
    ).toThrow("Pole trackIds[0]");
  });

  it("rejects duplicate identifiers instead of removing them", () => {
    expect(() =>
      parsePlaylistToSave({ name: "Playlist", trackIds: [firstId, firstId] })
    ).toThrow("Pole trackIds[1] powtarza identyfikator utworu");
  });

  it("detects duplicates after trimming whitespace", () => {
    expect(() =>
      parsePlaylistToSave({
        name: "Playlist",
        trackIds: [firstId, secondId, " \n" + firstId + "\t "],
      })
    ).toThrow("Pole trackIds[2] powtarza identyfikator utworu");
  });

  it("keeps case-sensitive identifiers distinct", () => {
    const trackIds = ["A".repeat(22), "a".repeat(22)];

    expect(
      parsePlaylistToSave({ name: "Playlist", trackIds }).trackIds
    ).toEqual(trackIds);
  });

  it("does not accept inherited name or trackIds as supplied fields", () => {
    const inheritedName = Object.assign(Object.create({ name: "Playlist" }), {
      trackIds: [firstId],
    });
    const inheritedIds = Object.assign(Object.create({ trackIds: [firstId] }), {
      name: "Playlist",
    });

    expect(() => parsePlaylistToSave(inheritedName)).toThrow(
      "Pole name jest wymagane"
    );
    expect(() => parsePlaylistToSave(inheritedIds)).toThrow(
      "Pole trackIds jest wymagane"
    );
  });

  it("discards extra fields including tokens and playlist visibility", () => {
    expect(
      parsePlaylistToSave({
        name: "Playlist",
        trackIds: [firstId],
        accessToken: "ignored-token",
        playlistId: "ignored-playlist-id",
        public: true,
        preferences: { energy: "high" },
      })
    ).toEqual({ name: "Playlist", trackIds: [firstId] });
  });

  it("returns an independent object and array without mutating input", () => {
    const playlist = {
      name: " Playlist ",
      trackIds: [" " + firstId + " ", secondId],
    };
    const original = structuredClone(playlist);
    Object.freeze(playlist.trackIds);
    Object.freeze(playlist);

    const result = parsePlaylistToSave(playlist);

    expect(result).toEqual({ name: "Playlist", trackIds: [firstId, secondId] });
    expect(result).not.toBe(playlist);
    expect(result.trackIds).not.toBe(playlist.trackIds);
    expect(playlist).toEqual(original);
  });

  it("does not retain identifiers between calls", () => {
    const playlist = { name: "Playlist", trackIds: [firstId] };

    expect(parsePlaylistToSave(playlist)).toEqual(playlist);
    expect(parsePlaylistToSave(playlist)).toEqual(playlist);
  });
});
