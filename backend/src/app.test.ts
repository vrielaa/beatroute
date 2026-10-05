import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAppConfig } from "./config/app.config.js";

describe("createApp", () => {
  it("serves the health endpoint and configured CORS origin", async () => {
    const app = createApp(createValidConfig());

    const response = await request(app)
      .get("/test")
      .set("Origin", "https://frontend.test")
      .expect(200, "backend works");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://frontend.test"
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("returns the common error contract for an unknown route", async () => {
    const app = createApp(createValidConfig());

    await request(app)
      .get("/missing")
      .expect(404, {
        error: { code: "ROUTE_NOT_FOUND", message: "Nie znaleziono trasy" },
      });
  });

  it("rejects incomplete startup configuration", () => {
    const config = createValidConfig();
    config.spotify.clientId = "";

    expect(() => createApp(config)).toThrow(
      "Brakuje zmiennej środowiskowej: SPOTIFY_CLIENT_ID"
    );
  });

  it("rejects production mode until an external session store is configured", () => {
    const config = createValidConfig();
    config.server.isProduction = true;

    expect(() => createApp(config)).toThrow(
      "NODE_ENV=production wymaga zewnętrznego store"
    );
  });

  it("returns 400 for invalid JSON request body", async () => {
    const malformedJson = '{"invalid": "json"';

    const app = createApp(createValidConfig());

    await request(app)
      .post("/api/tracks/audio-features")
      .set("Content-Type", "application/json")
      .send(malformedJson)
      .expect(400, {
        error: {
          code: "INVALID_JSON",
          message: "Treść żądania nie jest poprawnym JSON-em",
        },
      });
  });

  it("returns 413 when JSON body exceeds the limit", async () => {
    const app = createApp(createValidConfig());
    const size = 101 * 1024; // 101 KB, exceeding the 100 KB limit

    const oversizedPayload = JSON.stringify({
      data: "x".repeat(size),
    });

    await request(app)
      .post("/api/tracks/audio-features")
      .set("Content-Type", "application/json")
      .send(oversizedPayload)
      .expect(413, {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Treść żądania przekracza dozwolony rozmiar",
        },
      });
  });
});

function createValidConfig() {
  return createAppConfig({
    FRONTEND_URL: "https://frontend.test",
    SESSION_SECRET: "test-session-secret",
    SPOTIFY_CLIENT_ID: "spotify-client-id",
    SPOTIFY_CLIENT_SECRET: "spotify-client-secret",
    SPOTIFY_REDIRECT_URI: "http://backend.test/auth/spotify/callback",
    LASTFM_API_KEY: "lastfm-api-key",
    LASTFM_SHARED_SECRET: "lastfm-shared-secret",
    LASTFM_REDIRECT_URI: "http://backend.test/auth/lastfm/callback",
    SOUNDCHARTS_APP_ID: "soundcharts-app-id",
    SOUNDCHARTS_API_KEY: "soundcharts-api-key",
  });
}
