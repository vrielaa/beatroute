import { describe, expect, it } from "vitest";

import { RequestValidationError } from "../../http/request-validation-error.js";
import { parseArtistNames, parseTrackInfoQuery } from "./lastfm.validators.js";

describe("parseArtistNames", () => {
  it("trims and returns valid artist names", () => {
    expect(parseArtistNames({ artists: [" Radiohead ", "Björk"] })).toEqual([
      "Radiohead",
      "Björk",
    ]);
  });

  it("accepts exactly 40 artists", () => {
    const artists = Array.from({ length: 40 }, (_, index) => `Artist ${index}`);

    expect(parseArtistNames({ artists })).toEqual(artists);
  });

  it.each([
    ["missing artists", {}],
    ["an empty array", { artists: [] }],
    ["a value other than an array", { artists: "Radiohead" }],
  ])("rejects %s", (_description, body) => {
    expect(() => parseArtistNames(body)).toThrow(RequestValidationError);
    expect(() => parseArtistNames(body)).toThrow(
      "Pole artists musi być niepustą tablicą nazw artystów"
    );
  });

  it("rejects more than 40 artists", () => {
    const artists = Array.from({ length: 41 }, (_, index) => `Artist ${index}`);

    expect(() => parseArtistNames({ artists })).toThrow(RequestValidationError);
    expect(() => parseArtistNames({ artists })).toThrow(
      "Jednocześnie można analizować maksymalnie 40 artystów"
    );
  });

  it.each([
    ["a blank artist name", ["Radiohead", "   "]],
    ["a non-string artist name", ["Radiohead", 42]],
  ])("rejects %s", (_description, artists) => {
    expect(() => parseArtistNames({ artists })).toThrow(RequestValidationError);
    expect(() => parseArtistNames({ artists })).toThrow(
      "Każdy element artists musi być niepustym tekstem"
    );
  });
});

describe("parseTrackInfoQuery", () => {
  it("returns a trimmed MBID identifier", () => {
    expect(parseTrackInfoQuery({ mbid: " track-mbid " })).toEqual({
      mbid: "track-mbid",
    });
  });

  it("returns trimmed artist and track names", () => {
    expect(
      parseTrackInfoQuery({ artist: " Cher ", track: " Believe " })
    ).toEqual({
      artist: "Cher",
      track: "Believe",
    });
  });

  it.each([
    ["no identifier", {}],
    ["only an artist", { artist: "Cher" }],
    ["only a track", { track: "Believe" }],
    ["blank names", { artist: " ", track: " " }],
    ["non-string values", { artist: 1, track: true }],
  ])("rejects a query with %s", (_description, query) => {
    expect(() => parseTrackInfoQuery(query)).toThrow(RequestValidationError);
    expect(() => parseTrackInfoQuery(query)).toThrow(
      "Podaj mbid albo oba parametry: artist i track"
    );
  });
});
