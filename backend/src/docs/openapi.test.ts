import { describe, expect, it } from "vitest";
import document from "./openapi.json" with { type: "json" };
import { generatePlaylist } from "@domain/playlist-generator/generate-playlist.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { parsePlaylistGeneratorRequirements } from "@http/routes/playlist-generator/requirements.validator.js";
import { parsePlaylistGeneratorPreferences } from "@http/routes/playlist-generator/preferences.validator.js";
import { parsePlaylistTrackIdsFile } from "@http/routes/playlist-generator/track-ids.validator.js";
import { parseSavedTracksOffset } from "@http/routes/playlist-generator/saved-tracks.validator.js";
import { parsePlaylistSourceSelection } from "@http/routes/playlist-generator/playlist-source.validator.js";
import { parsePlaylistToSave } from "@http/routes/playlist-generator/save-playlist.validator.js";
import { PartialPlaylistSaveError } from "@application/playlist-generator/partial-playlist-save.error.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { mapErrorToHttp } from "@http/error-handler.js";
import { parsePlaylistResumeId } from "@http/routes/playlist-generator/save-playlist.validator.js";
import { PlaylistSaveConflictError } from "@application/playlist-generator/playlist-save-conflict.error.js";
import { parseSpotifyTopTracksQuery } from "@integrations/spotify/spotify.validators.js";
import { parseTopTracksBatchQuery } from "@http/routes/me/top-tracks.validator.js";
import { parseAudioFeaturesBody } from "@http/routes/tracks/audio-features.validator.js";

describe("playlist source OpenAPI contract", () => {
  it("documents an authenticated first-page request accepted by the validator", () => {
    const operation =
      document.paths["/api/playlist-generator/prepare-playlist"].post;
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(
      parsePlaylistSourceSelection(
        operation.requestBody.content["application/json"].example
      )
    ).toEqual({
      playlistId: "2DsAx0MIcI0oyB8AV8ndn2",
      offset: 0,
      snapshotId: null,
    });
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/PreparedPlaylistPage");
    expect(operation.responses["409"].description).toContain(
      "PLAYLIST_SOURCE_CHANGED"
    );
    expect(
      operation.responses["429"].headers["Retry-After"].schema.minimum
    ).toBe(0);
    expect(
      document.components.schemas.PlaylistSourceSelection.required
    ).toEqual(["playlistId", "offset", "snapshotId"]);
    expect(document.components.schemas.PreparedPlaylistPage.required).toEqual([
      "playlist",
      "preparedDataset",
      "pagination",
      "unavailableItemsCount",
    ]);
  });
});

describe("top-track preparation OpenAPI contract", () => {
  it("documents the two completeness purposes and the validated default selection", () => {
    const operation = document.paths["/api/me/top-tracks/dataset"].get;
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(
      operation.parameters.find((parameter) => parameter.name === "purpose")
        ?.schema
    ).toMatchObject({
      enum: ["statistics", "music-map"],
      default: parseTopTracksBatchQuery().purpose,
    });
    expect(operation.description).toContain(
      "Any technical ReccoBeats failure aborts the batch"
    );
    expect(
      operation.responses["429"].headers["Retry-After"].schema.minimum
    ).toBe(0);
    expect(document.components.schemas.TopTracksBatch.required).toEqual([
      "tracks",
      "audioFeatures",
      "processedItems",
      "skippedItems",
      "totalItems",
      "nextOffset",
    ]);
  });

  it("documents local statistics without provider reads and a matching count limit", () => {
    const operation = document.paths["/api/tracks/statistics"].post;
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(operation.description).toContain(
      "No Spotify, ReccoBeats or Soundcharts request"
    );
    const limit =
      operation.requestBody.content["application/json"].schema.properties
        .audioFeatures.maxItems;
    const features = Array.from({ length: limit }, (_, index) => ({
      spotifyId: String(index),
      energy: 0,
    }));
    expect(parseAudioFeaturesBody({ audioFeatures: features })).toHaveLength(
      limit
    );
    expect(() =>
      parseAudioFeaturesBody({
        audioFeatures: [...features, { spotifyId: "extra" }],
      })
    ).toThrow();
  });
});

describe("top tracks pagination OpenAPI contract", () => {
  const operation = document.paths["/api/me/top-tracks"].get;

  it("documents the offset bounds and first-page default accepted by the validator", () => {
    const offset = operation.parameters.find(
      (parameter) => parameter.name === "offset"
    );

    expect(offset).toMatchObject({
      in: "query",
      required: false,
      schema: {
        type: "integer",
        minimum: 0,
        maximum: Number.MAX_SAFE_INTEGER,
        default: parseSpotifyTopTracksQuery().offset,
      },
    });
    expect(operation.description).toContain("same time_range");
    expect(operation.description).toContain("next: null");
  });

  it("documents validation errors and invalid upstream pages separately", () => {
    expect(operation.responses["400"].description).toContain("offset");
    expect(operation.responses["502"].description).toContain("pagination");
    expect(
      operation.responses["502"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/ErrorResponse");
  });
});

describe("track analysis OpenAPI contract", () => {
  it("documents a single batch analysis endpoint and retains the single-track Soundcharts route", () => {
    expect(document.paths).not.toHaveProperty("/api/tracks/audio-features");
    expect(document.paths).not.toHaveProperty("/api/tracks/audio-stats");
    expect(document.components.schemas).not.toHaveProperty(
      "MultipleAudioFeaturesResponse"
    );
    expect(
      document.paths["/api/tracks/{spotifyTrackId}/audio-features"].get
    ).toBeDefined();

    const operation = document.paths["/api/tracks/analysis"].post;
    expect(operation.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/TrackIdsRequest"
    );
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/TrackAnalysisResponse");
  });
});

describe("playlist resumption OpenAPI contract", () => {
  const operation = document.paths["/api/playlist-generator/resume-save"].post;

  it("requires both private playlist scopes and only accepts the playlist ID", () => {
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(operation.description).toContain("playlist-read-private");
    expect(operation.description).toContain("playlist-modify-private");
    const body = operation.requestBody.content["application/json"];
    expect(body.schema.required).toEqual(["playlistId"]);
    expect(parsePlaylistResumeId(body.example)).toBe(body.example.playlistId);
    expect(Object.keys(body.schema.properties)).toEqual(["playlistId"]);
  });

  it("documents success without creating another playlist and the retained conflict state", () => {
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/SavedPlaylist");
    expect(operation.description).toContain("without writing");
    for (const code of [
      "PLAYLIST_CONTENTS_CHANGED",
      "PLAYLIST_SAVE_IN_PROGRESS",
    ] as const) {
      const mapped = mapErrorToHttp(new PlaylistSaveConflictError(code));
      expect(mapped.status).toBe(409);
      expect(mapped.body.error.code).toBe(code);
      expect(operation.responses["409"].description).toContain(code);
    }
    expect(
      operation.responses["429"].headers["Retry-After"].schema.minimum
    ).toBe(0);
  });
});

describe("playlist saving OpenAPI contract", () => {
  const operation = document.paths["/api/playlist-generator/save"].post;
  const schemas = document.components.schemas;

  it("requires a session and documents the private-playlist permission", () => {
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(operation.description).toContain("playlist-modify-private");
    expect(operation.description).toContain(
      "Writes are not automatically retried"
    );
    expect(operation.requestBody.required).toBe(true);
    expect(operation.requestBody.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/PlaylistToSave"
    );
  });

  it("documents the same selection format accepted by the validator", () => {
    expect(schemas.PlaylistToSave.required).toEqual(["name", "trackIds"]);
    const ids = schemas.PlaylistToSave.properties.trackIds;
    expect(ids.minItems).toBe(1);
    expect(ids.maxItems).toBe(500);
    expect(ids.uniqueItems).toBe(true);
    const pattern = new RegExp(ids.items.pattern);
    expect(pattern.test(" 3sNVsP50132BTNlImLx70i ")).toBe(true);
    expect(pattern.test("spotify:track:3sNVsP50132BTNlImLx70i")).toBe(false);
    const example = operation.requestBody.content["application/json"].example;
    expect(parsePlaylistToSave(example)).toEqual(example);
  });

  it("documents 201 only for a complete save with all four public result fields", () => {
    expect(
      operation.responses["201"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/SavedPlaylist");
    expect(schemas.SavedPlaylist.required).toEqual([
      "id",
      "name",
      "spotifyUrl",
      "trackCount",
    ]);
    expect(schemas.SavedPlaylist.properties.trackCount.minimum).toBe(1);
    expect(schemas.SavedPlaylist.properties.trackCount.maximum).toBe(500);
    const example =
      operation.responses["201"].content["application/json"].example;
    expect(example.trackCount).toBe(
      operation.requestBody.content["application/json"].example.trackIds.length
    );
    expect(Object.keys(example).sort()).toEqual(
      [...schemas.SavedPlaylist.required].sort()
    );
  });

  it("documents shared errors, missing permission and an optional Retry-After header", () => {
    expect(Object.keys(operation.responses).sort()).toEqual([
      "201",
      "400",
      "401",
      "403",
      "413",
      "429",
      "500",
      "502",
      "503",
      "504",
      "default",
    ]);
    expect(operation.responses["403"].description).toContain(
      "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED"
    );
    expect(operation.responses["429"].headers["Retry-After"].schema).toEqual({
      type: "integer",
      minimum: 0,
    });
    for (const [status, response] of Object.entries(operation.responses)) {
      if (status !== "201") {
        expect(response.content["application/json"].schema.$ref).toBe(
          "#/components/schemas/ErrorResponse"
        );
      }
    }
  });

  it("provides a partial-save example matching the central error mapper", () => {
    const example =
      operation.responses["429"].content["application/json"].example;
    const mapped = mapErrorToHttp(
      new PartialPlaylistSaveError(
        example.error.details.progress,
        new SpotifyApiError("Rate limit", 429, null, {
          retryAfterSeconds: example.error.details.retryAfterSeconds,
        })
      )
    );

    expect(mapped.status).toBe(429);
    expect(mapped.body).toEqual(example);
    expect(mapped.headers).toEqual({ "Retry-After": "30" });
    expect(operation.description).toContain(
      "an unconfirmed batch may already have been written"
    );
  });
});

describe("saved tracks preparation OpenAPI contract", () => {
  const operation =
    document.paths["/api/playlist-generator/prepare-saved-tracks"].post;
  const schemas = document.components.schemas;

  it("requires a Spotify session and library-read permission with an explicit offset", () => {
    expect(operation.security).toEqual([{ SessionCookie: [] }]);
    expect(operation.description).toContain("user-library-read");
    expect(operation.requestBody.required).toBe(true);
    const body = operation.requestBody.content["application/json"];
    expect(body.schema.required).toEqual(["offset"]);
    expect(body.schema.properties).toEqual({
      offset: { type: "integer", minimum: 0, maximum: 499 },
    });
    expect(parseSavedTracksOffset(body.example)).toBe(0);
  });

  it("wraps the existing prepared dataset with page progress and unavailable counts", () => {
    expect(
      operation.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/PreparedSavedTracksPage");
    expect(schemas.PreparedSavedTracksPage.required).toEqual([
      "preparedDataset",
      "pagination",
      "unavailableItemsCount",
    ]);
    expect(
      schemas.PreparedSavedTracksPage.properties.preparedDataset.$ref
    ).toBe("#/components/schemas/PreparedPlaylistDataset");
    expect(schemas.PreparedSavedTracksPage.properties.pagination.$ref).toBe(
      "#/components/schemas/SavedTracksPagination"
    );
    expect(schemas.SavedTracksPagination.required).toEqual([
      "offset",
      "processedItems",
      "totalItems",
      "nextOffset",
    ]);
    expect(
      schemas.SavedTracksPagination.properties.processedItems.maximum
    ).toBe(50);
    expect(schemas.SavedTracksPagination.properties.nextOffset).toMatchObject({
      type: ["integer", "null"],
      minimum: 1,
      maximum: 499,
    });
    expect(
      schemas.SavedTracksPagination.properties.totalItems
    ).not.toHaveProperty("maximum");
  });

  it("provides a consistent empty-library example without weakening generator validation", () => {
    const example =
      operation.responses["200"].content["application/json"].example;
    expect(example).toEqual({
      preparedDataset: {
        dataset: { version: 1, tracks: [] },
        skippedTracks: [],
        incompleteTracks: [],
      },
      pagination: {
        offset: 0,
        processedItems: 0,
        totalItems: 0,
        nextOffset: null,
      },
      unavailableItemsCount: 0,
    });
    expect(() =>
      parsePlaylistGeneratorDataset(example.preparedDataset.dataset)
    ).toThrow();
  });

  it("documents permission errors, shared failures and Retry-After", () => {
    expect(operation.responses["403"].description).toContain(
      "SPOTIFY_LIBRARY_PERMISSION_REQUIRED"
    );
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
});

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
    const requestedIds = parsePlaylistTrackIdsFile(
      operation.requestBody.content["application/json"].example
    ).spotifyTrackIds;
    const returnedIds = [
      ...dataset.tracks.map((track) => track.id),
      ...example.skippedTracks.map((track) => track.spotifyId),
    ];
    expect(returnedIds).toHaveLength(new Set(returnedIds).size);
    expect(new Set(returnedIds)).toEqual(new Set(requestedIds));
    for (const track of dataset.tracks) {
      expect(Object.keys(track.audioFeatures).sort()).toEqual(
        [...schemas.PlaylistAudioFeatures.required].sort()
      );
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
      "targetBpm",
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

  it("documents target BPM rounding and forbids simultaneous BPM constraints", () => {
    expect(schemas.PlaylistRequirements.properties.targetBpm.type).toEqual([
      "integer",
      "null",
    ]);
    expect(schemas.PlaylistRequirements.properties.targetBpm.minimum).toBe(1);
    expect(schemas.PlaylistRequirements.description).toContain(
      "Math.round(tempo)"
    );
    expect(schemas.PlaylistRequirements.not).toEqual({
      properties: {
        tempoRange: { type: "object" },
        targetBpm: { type: "integer" },
      },
      required: ["tempoRange", "targetBpm"],
    });
    expect(
      schemas.PlaylistTrackRejectionReason.oneOf[1].properties.code.enum
    ).toEqual(["outside-range", "tempo-mismatch"]);
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
