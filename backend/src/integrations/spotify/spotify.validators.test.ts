import { describe, expect, it } from "vitest";

import { RequestValidationError } from "@http/request-validation-error.js";
import {
  parseSpotifyTopItemsQuery,
  parseSpotifyTopTracksQuery,
  parseTrackIds,
} from "./spotify.validators.js";

describe("Spotify validators", () => {
  describe("parseSpotifyTopItemsQuery", () => {
    it("returns default values for an empty query", () => {
      expect(parseSpotifyTopItemsQuery()).toEqual({
        limit: 10,
        timeRange: "medium_term",
      });
    });

    it("parses and trims valid query values", () => {
      expect(
        parseSpotifyTopItemsQuery({
          limit: " 25 ",
          time_range: " long_term ",
        })
      ).toEqual({
        limit: 25,
        timeRange: "long_term",
      });
    });

    it.each([
      ["limit", { limit: ["10", "20"] }],
      ["time_range", { time_range: ["short_term", "long_term"] }],
    ])("rejects a repeated %s parameter", (parameterName, query) => {
      expect(() => parseSpotifyTopItemsQuery(query)).toThrow(
        RequestValidationError
      );
      expect(() => parseSpotifyTopItemsQuery(query)).toThrow(
        `Parametr "${parameterName}" może wystąpić tylko raz`
      );
    });

    it.each(["0", "41", "1.5", "not-a-number", true, {}])(
      "rejects an invalid limit: %s",
      (limit) => {
        expect(() => parseSpotifyTopItemsQuery({ limit })).toThrow(
          'Parametr "limit" musi być liczbą całkowitą od 1 do 40'
        );
      }
    );

    it.each(["recent", 30, true, {}])(
      "rejects an invalid time range: %s",
      (timeRange) => {
        expect(() =>
          parseSpotifyTopItemsQuery({ time_range: timeRange })
        ).toThrow(
          'Parametr "time_range" musi być jedną z wartości: short_term, medium_term, long_term'
        );
      }
    );

    it("uses the configured maximum limit", () => {
      expect(() =>
        parseSpotifyTopItemsQuery({ limit: "11" }, { maxLimit: 10 })
      ).toThrow('Parametr "limit" musi być liczbą całkowitą od 1 do 10');
    });
  });

  describe("parseSpotifyTopTracksQuery", () => {
    it("defaults to the first page without changing the default period or limit", () => {
      expect(parseSpotifyTopTracksQuery()).toEqual({
        limit: 10,
        timeRange: "medium_term",
        offset: 0,
      });
    });

    it("parses a later page and preserves the selected period", () => {
      expect(
        parseSpotifyTopTracksQuery({
          limit: " 3 ",
          time_range: " short_term ",
          offset: " 10 ",
        })
      ).toEqual({ limit: 3, timeRange: "short_term", offset: 10 });
    });

    it.each([undefined, null, "", " ", "0"])(
      "uses offset zero for an omitted or empty value: %s",
      (offset) => {
        expect(parseSpotifyTopTracksQuery({ offset }).offset).toBe(0);
      }
    );

    it("accepts the largest safe integer offset", () => {
      expect(
        parseSpotifyTopTracksQuery({
          offset: String(Number.MAX_SAFE_INTEGER),
        }).offset
      ).toBe(Number.MAX_SAFE_INTEGER);
    });

    it.each([
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      "not-a-number",
      "9007199254740992",
      true,
      10,
      {},
    ])("rejects an invalid offset: %s", (offset) => {
      expect(() => parseSpotifyTopTracksQuery({ offset })).toThrow(
        'Parametr "offset" musi być nieujemną, bezpieczną liczbą całkowitą'
      );
    });

    it("rejects repeated offsets", () => {
      expect(() => parseSpotifyTopTracksQuery({ offset: ["0", "10"] })).toThrow(
        'Parametr "offset" może wystąpić tylko raz'
      );
    });

    it.each([
      { limit: "41" },
      { time_range: "recent" },
      { limit: ["10", "20"] },
      { time_range: ["short_term", "long_term"] },
    ])("retains limit and period validation: %j", (query) => {
      expect(() => parseSpotifyTopTracksQuery(query)).toThrow(
        RequestValidationError
      );
    });
  });

  describe("parseTrackIds", () => {
    it("returns trimmed track IDs", () => {
      expect(parseTrackIds({ trackIds: [" track-1 ", "track-2"] })).toEqual([
        "track-1",
        "track-2",
      ]);
    });

    it.each([{}, { trackIds: [] }, { trackIds: "track-1" }])(
      "rejects a missing, empty or non-array list: %s",
      (body) => {
        expect(() => parseTrackIds(body)).toThrow(RequestValidationError);
        expect(() => parseTrackIds(body)).toThrow(
          "trackIds musi być niepustą tablicą"
        );
      }
    );

    it("rejects more track IDs than allowed", () => {
      expect(() =>
        parseTrackIds(
          { trackIds: ["track-1", "track-2", "track-3"] },
          { maxLimit: 2 }
        )
      ).toThrow("trackIds może zawierać maksymalnie 2 utworów");
    });

    it.each([{ trackIds: ["track-1", " "] }, { trackIds: ["track-1", 2] }])(
      "rejects an invalid track ID: $trackIds",
      ({ trackIds }) => {
        expect(() => parseTrackIds({ trackIds })).toThrow(
          "trackIds[1] musi być niepustym stringiem"
        );
      }
    );
  });
});
