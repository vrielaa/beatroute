import { describe, expect, it } from "vitest";
import document from "./openapi.json" with { type: "json" };
import { generatePlaylist } from "@domain/playlist-generator/generate-playlist.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { parsePlaylistGeneratorRequirements } from "@http/routes/playlist-generator/requirements.validator.js";
import { parsePlaylistGeneratorPreferences } from "@http/routes/playlist-generator/preferences.validator.js";
import { parsePlaylistTrackIdsFile } from "@http/routes/playlist-generator/track-ids.validator.js";

describe("playlist dataset preparation OpenAPI contract", () => {
  const operation =
    document.paths["/api/playlist-generator/prepare-dataset"].post;
  const schemas = document.components.schemas;

  it("documents session authentication and a required ID-only JSON body", () => {
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(document.components.securitySchemes.SessionCookie).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "sessionId",
    });
    expect(operation.requestBody.required).toBe(true);
    expect(operation.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/PlaylistTrackIdsFile"
    );
    expect(schemas.PlaylistTrackIdsFile.required).toEqual([
      "version",
      "spotifyTrackIds",
    ]);
  });

  it("documents version 1, the 500-entry limit and trimming-compatible ID syntax", () => {
    const file = schemas.PlaylistTrackIdsFile;
    expect(file.properties.version.const).toBe(1);
    expect(file.properties.spotifyTrackIds.minItems).toBe(1);
    expect(file.properties.spotifyTrackIds.maxItems).toBe(500);
    const pattern = new RegExp(file.properties.spotifyTrackIds.items.pattern);
    expect(pattern.test(" 3sNVsP50132BTNlImLx70i ")).toBe(true);
    expect(pattern.test("spotify:track:3sNVsP50132BTNlImLx70i")).toBe(false);
    expect(pattern.test("invalid")).toBe(false);
    const example = operation.requestBody.content["application/json"].example;
    expect(parsePlaylistTrackIdsFile(example)).toEqual(example);
  });

  it("allows empty preparation results without weakening generator validation", () => {
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/PreparedPlaylistDataset");
    expect(schemas.PreparedPlaylistDataset.required).toEqual([
      "dataset",
      "skippedTracks",
      "incompleteTracks",
    ]);
    expect(
      schemas.PreparedPlaylistDataset.properties.dataset.properties.tracks
        .minItems
    ).toBe(0);
    expect(schemas.PlaylistDataset.properties.tracks.minItems).toBe(1);
    expect(
      schemas.PreparedPlaylistDataset.properties.skippedTracks.items.properties
        .reason.enum
    ).toEqual(["metadata-unavailable", "audio-features-unavailable"]);
  });

  it("documents the shared error contract and optional Retry-After header", () => {
    expect(Object.keys(operation.responses).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "413",
      "429",
      "500",
      "502",
      "503",
      "504",
    ]);
    expect(operation.responses["429"].headers["Retry-After"].schema).toEqual({
      type: "integer",
      minimum: 0,
    });
    for (const [status, response] of Object.entries(operation.responses)) {
      if (status !== "200") {
        expect(response.content["application/json"].schema.$ref).toBe(
          "#/components/schemas/ErrorResponse"
        );
      }
    }
  });

  it("provides a valid dataset example with consistent missing and skipped measurements", () => {
    const example =
      operation.responses["200"].content["application/json"].example;
    const dataset = parsePlaylistGeneratorDataset(example.dataset);
    expect(dataset).toEqual(example.dataset);
    for (const incomplete of example.incompleteTracks) {
      const track = dataset.tracks.find(
        (item) => item.id === incomplete.spotifyId
      );
      expect(track).toBeDefined();
      for (const feature of incomplete.missingFeatures) {
        expect(track && Reflect.get(track.audioFeatures, feature)).toBeNull();
      }
    }
    for (const skipped of example.skippedTracks) {
      expect(
        dataset.tracks.some((track) => track.id === skipped.spotifyId)
      ).toBe(false);
    }
  });
});

describe("playlist generator OpenAPI contract", () => {
  const operation = document.paths["/api/playlist-generator/generate"].post;
  const schemas = document.components.schemas;

  it("documents a required JSON request without session authentication", () => {
    expect(operation.security).toEqual([]);
    expect(operation.requestBody.required).toBe(true);
    expect(operation.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/PlaylistGeneratorRequest"
    );
    expect(schemas.PlaylistGeneratorRequest.required).toEqual([
      "dataset",
      "requirements",
      "preferences",
    ]);
  });

  it("documents version 1, the 500-track limit and all eight measurements", () => {
    expect(schemas.PlaylistDataset.properties.version.const).toBe(1);
    expect(schemas.PlaylistDataset.properties.tracks.minItems).toBe(1);
    expect(schemas.PlaylistDataset.properties.tracks.maxItems).toBe(500);
    expect(schemas.PlaylistAudioFeatures.required).toEqual([
      "tempo",
      "energy",
      "danceability",
      "valence",
      "acousticness",
      "instrumentalness",
      "speechiness",
      "liveness",
    ]);
    expect(schemas.PlaylistAudioFeatures.properties.tempo.type).toEqual([
      "number",
      "null",
    ]);
    expect(
      schemas.PlaylistAudioFeatures.properties.tempo.exclusiveMinimum
    ).toBe(0);
    expect(schemas.PlaylistUnitMeasurement.type).toEqual(["number", "null"]);
    expect(schemas.PlaylistUnitMeasurement.minimum).toBe(0);
    expect(schemas.PlaylistUnitMeasurement.maximum).toBe(1);
  });

  it("requires explicit requirements and five nullable preference levels", () => {
    expect(schemas.PlaylistRequirements.required).toEqual([
      "tempoRange",
      "maxSpeechiness",
      "maxLiveness",
    ]);
    expect(schemas.PlaylistRequirements.properties.tempoRange.anyOf).toEqual([
      { $ref: "#/components/schemas/PlaylistTempoRange" },
      { type: "null" },
    ]);
    expect(schemas.PlaylistPreferences.required).toEqual([
      "energy",
      "danceability",
      "valence",
      "acousticness",
      "instrumentalness",
    ]);
    expect(schemas.PlaylistPreferenceSetting.enum).toEqual([
      "low",
      "medium",
      "high",
      null,
    ]);
  });

  it("documents successful and error responses using the actual response groups", () => {
    expect(Object.keys(operation.responses).sort()).toEqual([
      "200",
      "400",
      "413",
      "500",
    ]);
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/GeneratedPlaylist");
    expect(schemas.GeneratedPlaylist.required).toEqual([
      "rankedTracks",
      "rejectedTracks",
    ]);
    expect(schemas.RejectedPlaylistTrack.properties.reasons.minItems).toBe(1);
    expect(
      schemas.PlaylistTrackEvaluation.properties.overallMatch.type
    ).toEqual(["number", "null"]);
    expect(
      schemas.PlaylistTrackEvaluation.properties.featureMatches.maxItems
    ).toBe(5);

    const errorResponses = [
      operation.responses["400"],
      operation.responses["413"],
      operation.responses["500"],
    ];

    for (const response of errorResponses) {
      expect(response.content["application/json"].schema.$ref).toBe(
        "#/components/schemas/ErrorResponse"
      );
    }
  });

  it("produces the documented response from the documented request example", () => {
    const example = operation.requestBody.content["application/json"].example;
    const dataset = parsePlaylistGeneratorDataset(example.dataset);
    const requirements = parsePlaylistGeneratorRequirements(
      example.requirements
    );
    const preferences = parsePlaylistGeneratorPreferences(example.preferences);

    expect(generatePlaylist(dataset, requirements, preferences)).toEqual(
      operation.responses["200"].content["application/json"].example
    );
  });
});
