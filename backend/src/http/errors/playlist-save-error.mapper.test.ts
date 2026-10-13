import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartialPlaylistSaveError } from "@application/playlist-generator/partial-playlist-save.error.js";
import type { PlaylistSaveProgress } from "@application/playlist-generator/types.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { errorHandler } from "../error-handler.js";
import { mapPartialPlaylistSaveError } from "./playlist-save-error.mapper.js";

describe("mapPartialPlaylistSaveError", () => {
  it("keeps playlist progress even when the cause is an unexpected error", () => {
    const error = new PartialPlaylistSaveError(
      createProgress(),
      new Error("Internal failure with sensitive details")
    );

    expect(mapPartialPlaylistSaveError(error)).toEqual({
      status: 500,
      body: {
        error: {
          code: "PLAYLIST_SAVE_INCOMPLETE",
          message:
            "Nie potwierdzono zapisu wszystkich utworów. Sprawdź utworzoną playlistę przed ponownym zapisem.",
          details: { progress: createProgress() },
        },
      },
    });
  });

  it.each([
    { cause: new SpotifyApiError("Unauthorized", 401), status: 401 },
    { cause: new SpotifyApiError("Forbidden", 403), status: 403 },
    { cause: new SpotifyApiError("Rejected request", 400), status: 400 },
    { cause: new SpotifyApiError("Rate limit", 429), status: 429 },
    { cause: new SpotifyApiError("Unavailable", 503), status: 503 },
    { cause: new SpotifyApiError("Upstream failure", 500), status: 502 },
    {
      cause: new SpotifyApiError("Connection failed", 502, null, {
        category: "network",
      }),
      status: 502,
    },
    {
      cause: new SpotifyApiError("Invalid response", 200, null, {
        category: "invalid-response",
      }),
      status: 502,
    },
    {
      cause: new SpotifyApiError("Timeout", 504, null, { category: "timeout" }),
      status: 504,
    },
  ])(
    "preserves status $status from a known integration cause",
    ({ cause, status }) => {
      const error = new PartialPlaylistSaveError(createProgress(), cause);

      expect(mapPartialPlaylistSaveError(error)).toMatchObject({
        status,
        body: {
          error: {
            code: "PLAYLIST_SAVE_INCOMPLETE",
            details: { progress: createProgress() },
          },
        },
      });
    }
  );

  it.each([0, 30])(
    "preserves Retry-After of %i seconds",
    (retryAfterSeconds) => {
      const cause = new SpotifyApiError("Rate limit", 429, null, {
        retryAfterSeconds,
      });
      const error = new PartialPlaylistSaveError(createProgress(), cause);

      expect(mapPartialPlaylistSaveError(error)).toMatchObject({
        status: 429,
        body: {
          error: {
            code: "PLAYLIST_SAVE_INCOMPLETE",
            details: { progress: createProgress(), retryAfterSeconds },
          },
        },
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }
  );

  it("does not invent a retry time when Spotify did not provide one", () => {
    const error = new PartialPlaylistSaveError(
      createProgress(),
      new SpotifyApiError("Rate limit without Retry-After", 429)
    );

    const result = mapPartialPlaylistSaveError(error);

    expect(result.status).toBe(429);
    expect(result.headers).toBeUndefined();
    expect(result.body.error.details).toEqual({ progress: createProgress() });
  });

  it("keeps zero confirmed tracks when the first batch fails", () => {
    const progress = { ...createProgress(), confirmedTrackCount: 0 };
    const error = new PartialPlaylistSaveError(
      progress,
      new SpotifyApiError("Timeout", 504, null, { category: "timeout" })
    );

    expect(mapPartialPlaylistSaveError(error)).toMatchObject({
      status: 504,
      body: { error: { details: { progress } } },
    });
  });

  it("exposes only approved fields and a fixed message, not raw error details", () => {
    const cause = new SpotifyApiError("secret-upstream-message", 503, {
      accessToken: "secret-access-token",
      clientSecret: "secret-client-secret",
    });
    const error = new PartialPlaylistSaveError(createProgress(), cause);
    error.message = "secret-overwritten-message";
    error.stack = "secret-stack-trace";
    Object.assign(error.progress, {
      accessToken: "secret-progress-token",
      trackIds: ["secret-track-id"],
    });

    const result = mapPartialPlaylistSaveError(error);

    expect(result.body.error.details).toEqual({ progress: createProgress() });
    expect(result.body.error.message).toContain("Sprawdź utworzoną playlistę");
    expect(JSON.stringify(result)).not.toContain("secret-");
  });

  it("copies progress instead of returning the error's mutable object", () => {
    const error = new PartialPlaylistSaveError(createProgress(), null);
    const result = mapPartialPlaylistSaveError(error);

    error.progress.confirmedTrackCount = 250;
    error.progress.name = "Changed name";

    expect(result.body.error.details).toEqual({ progress: createProgress() });
  });

  it("does not trust a plain object pretending to be an integration error", () => {
    const error = new PartialPlaylistSaveError(createProgress(), {
      status: 401,
      category: "authentication",
      retryAfterSeconds: 30,
      message: "secret-message",
    });

    const result = mapPartialPlaylistSaveError(error);

    expect(result.status).toBe(500);
    expect(result.headers).toBeUndefined();
    expect(result.body.error.details).toEqual({ progress: createProgress() });
    expect(JSON.stringify(result)).not.toContain("secret-message");
  });
});

describe("partial playlist save errors through Express", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns progress and the actual Retry-After header through the central handler", async () => {
    const error = new PartialPlaylistSaveError(
      createProgress(),
      new SpotifyApiError("Rate limit", 429, null, { retryAfterSeconds: 30 })
    );

    const response = await request(createTestApp(error))
      .get("/test/playlist-save-error")
      .expect(429)
      .expect("Retry-After", "30");

    expect(response.body).toEqual(mapPartialPlaylistSaveError(error).body);
    expect(response.body.error.details.progress.confirmedTrackCount).toBe(100);
  });

  it("returns the existing playlist instead of a generic 500 and hides diagnostic data", async () => {
    const error = new PartialPlaylistSaveError(
      createProgress(),
      new Error("secret-internal-details")
    );

    const response = await request(createTestApp(error))
      .get("/test/playlist-save-error")
      .expect(500);

    expect(response.body.error.code).toBe("PLAYLIST_SAVE_INCOMPLETE");
    expect(response.body.error.details).toEqual({ progress: createProgress() });
    expect(response.headers["retry-after"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("secret-");
  });
});

function createProgress(): PlaylistSaveProgress {
  return {
    id: "playlist-id",
    name: "Na siłownię",
    spotifyUrl: "https://open.spotify.com/playlist/playlist-id",
    confirmedTrackCount: 100,
    requestedTrackCount: 250,
  };
}

function createTestApp(error: unknown) {
  const app = express();
  app.get("/test/playlist-save-error", (_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
}
