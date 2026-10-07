import { describe, expect, it } from "vitest";

import { LastfmApiError } from "@integrations/lastfm/lastfm-api.error.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { SoundchartsApiError } from "@integrations/soundcharts/soundcharts-api.error.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { SpotifyAuthApiError } from "@integrations/spotify/auth/api-error.js";
import { RequestValidationError } from "./request-validation-error.js";
import { mapErrorToHttp } from "./error-handler.js";
import { HttpError } from "./errors/http-error.js";

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
      mapErrorToHttp(
        new SpotifyAuthApiError("Invalid grant", {
          kind: "oauth",
          upstreamStatus: 400,
          oauthCode: "invalid_grant",
        })
      )
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: "SPOTIFY_AUTH_API_ERROR",
          message: "Invalid grant",
          details: {
            integration: "spotify-auth",
            upstreamStatus: 400,
            oauthCode: "invalid_grant",
          },
        },
      },
    });
  });

  it("maps invalid Spotify client credentials to a configuration error", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Invalid client secret", {
          kind: "oauth",
          upstreamStatus: 401,
          oauthCode: "invalid_client",
        })
      )
    ).toMatchObject({
      status: 503,
      body: {
        error: { code: "SPOTIFY_CONFIGURATION_ERROR" },
      },
    });
  });

  it("maps malformed Spotify token requests to an internal error", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Unsupported grant", {
          kind: "oauth",
          upstreamStatus: 400,
          oauthCode: "unsupported_grant_type",
        })
      )
    ).toMatchObject({
      status: 500,
      body: {
        error: { code: "SPOTIFY_AUTH_REQUEST_ERROR" },
      },
    });
  });

  it("maps Spotify connection failures to Bad Gateway", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Connection failed", { kind: "network" })
      )
    ).toMatchObject({
      status: 502,
      body: {
        error: { code: "SPOTIFY_AUTH_UNAVAILABLE" },
      },
    });
  });

  it("maps Spotify timeouts to Gateway Timeout", () => {
    expect(
      mapErrorToHttp(new SpotifyAuthApiError("Timed out", { kind: "timeout" }))
    ).toMatchObject({
      status: 504,
      body: {
        error: { code: "SPOTIFY_AUTH_TIMEOUT" },
      },
    });
  });

  it("maps a Spotify service outage to Service Unavailable", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Service unavailable", {
          kind: "oauth",
          upstreamStatus: 503,
        })
      )
    ).toMatchObject({
      status: 503,
      body: {
        error: { code: "SPOTIFY_AUTH_UNAVAILABLE" },
      },
    });
  });

  it("preserves Spotify rate-limit retry information", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Too many requests", {
          kind: "oauth",
          upstreamStatus: 429,
          retryAfterSeconds: 30,
        })
      )
    ).toEqual({
      status: 429,
      body: {
        error: {
          code: "SPOTIFY_RATE_LIMITED",
          message: "Przekroczono limit zapytań Spotify",
          details: {
            integration: "spotify-auth",
            upstreamStatus: 429,
            retryAfterSeconds: 30,
          },
        },
      },
      headers: { "Retry-After": "30" },
    });
  });

  it("maps malformed Spotify responses to Bad Gateway", () => {
    expect(
      mapErrorToHttp(
        new SpotifyAuthApiError("Invalid response", {
          kind: "invalid-response",
          upstreamStatus: 200,
        })
      )
    ).toMatchObject({
      status: 502,
      body: {
        error: { code: "SPOTIFY_AUTH_INVALID_RESPONSE" },
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

  it("maps an invalid Last.fm API key to a configuration error", () => {
    expect(
      mapErrorToHttp(new LastfmApiError("Invalid API key", 10)).status
    ).toBe(503);
  });

  it("maps a Last.fm rate limit without provider-specific HTTP logic", () => {
    expect(mapErrorToHttp(new LastfmApiError("Rate limit", 29))).toEqual({
      status: 429,
      body: {
        error: {
          code: "LASTFM_API_ERROR",
          message: "Rate limit",
          details: {
            integration: "lastfm",
            upstreamStatus: null,
            upstreamCode: 29,
          },
        },
      },
    });
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

  it("preserves retry information from an external integration", () => {
    const error = new ReccoBeatsApiError("Too many requests", 429, null, {
      retryAfterSeconds: 45,
    });

    expect(mapErrorToHttp(error)).toEqual({
      status: 429,
      body: {
        error: {
          code: "RECCOBEATS_API_ERROR",
          message: "Too many requests",
          details: {
            integration: "reccobeats",
            upstreamStatus: 429,
            retryAfterSeconds: 45,
          },
        },
      },
      headers: { "Retry-After": "45" },
    });
  });

  it("maps a Soundcharts outage to Service Unavailable", () => {
    expect(mapErrorToHttp(new SoundchartsApiError("Unavailable", 503))).toEqual(
      {
        status: 503,
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
