import { describe, expect, it } from "vitest";

import { LastfmApiError } from "@integrations/lastfm/lastfm-api.error.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { SoundchartsApiError } from "@integrations/soundcharts/soundcharts-api.error.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { SpotifyAuthApiError } from "@integrations/spotify/spotify-auth-api.error.js";
import { RequestValidationError } from "./request-validation-error.js";
import { HttpError, mapErrorToHttp } from "./error-response.js";

describe("mapErrorToHttp", () => {
  it("preserves an explicit HTTP error", () => {
    expect(
      mapErrorToHttp(
        new HttpError(409, "RESOURCE_CONFLICT", "Conflict", { id: 1 })
      )
    ).toEqual({
      status: 409,
      body: {
        error: {
          code: "RESOURCE_CONFLICT",
          message: "Conflict",
          details: { id: 1 },
        },
      },
    });
  });

  it("maps request validation errors to Bad Request", () => {
    expect(mapErrorToHttp(new RequestValidationError("Invalid input"))).toEqual(
      {
        status: 400,
        body: {
          error: { code: "VALIDATION_ERROR", message: "Invalid input" },
        },
      }
    );
  });

  it("preserves the Spotify Web API status", () => {
    expect(
      mapErrorToHttp(
        new SpotifyApiError("Expired token", 401, { reason: "expired" })
      )
    ).toEqual({
      status: 401,
      body: {
        error: {
          code: "SPOTIFY_API_ERROR",
          message: "Expired token",
          details: { integration: "spotify", upstreamStatus: 401 },
        },
      },
    });
  });

  it("preserves the Spotify Accounts API status", () => {
    expect(
      mapErrorToHttp(new SpotifyAuthApiError("Invalid grant", 400))
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: "SPOTIFY_AUTH_API_ERROR",
          message: "Invalid grant",
          details: { integration: "spotify-auth", upstreamStatus: 400 },
        },
      },
    });
  });

  it("maps an invalid Last.fm session to Unauthorized", () => {
    expect(mapErrorToHttp(new LastfmApiError("Invalid session", 9))).toEqual({
      status: 401,
      body: {
        error: {
          code: "LASTFM_API_ERROR",
          message: "Invalid session",
          details: {
            integration: "lastfm",
            upstreamStatus: null,
            upstreamCode: 9,
          },
        },
      },
    });
  });

  it("maps other Last.fm errors to Bad Gateway", () => {
    expect(
      mapErrorToHttp(new LastfmApiError("Invalid API key", 10)).status
    ).toBe(502);
  });

  it("maps a ReccoBeats API failure to Bad Gateway", () => {
    const error = new ReccoBeatsApiError("ReccoBeats unavailable", 530, {
      error_code: 1033,
    });

    expect(mapErrorToHttp(error)).toEqual({
      status: 502,
      body: {
        error: {
          code: "RECCOBEATS_API_ERROR",
          message: "ReccoBeats unavailable",
          details: { integration: "reccobeats", upstreamStatus: 530 },
        },
      },
    });
  });

  it("maps Soundcharts failures to Bad Gateway", () => {
    expect(mapErrorToHttp(new SoundchartsApiError("Unavailable", 503))).toEqual(
      {
        status: 502,
        body: {
          error: {
            code: "SOUNDCHARTS_API_ERROR",
            message: "Unavailable",
            details: { integration: "soundcharts", upstreamStatus: 503 },
          },
        },
      }
    );
  });

  it("hides unexpected internal errors", () => {
    expect(mapErrorToHttp(new Error("database password leaked"))).toEqual({
      status: 500,
      body: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Wewnętrzny błąd serwera",
        },
      },
    });
  });
});
