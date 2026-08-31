import { describe, expect, it } from "vitest";

import { SPOTIFY_SCOPES, createAppConfig } from "./app.config.js";

describe("createAppConfig", () => {
  it("maps environment variables and numeric port", () => {
    const config = createAppConfig({
      NODE_ENV: "production",
      PORT: "8080",
      FRONTEND_URL: "https://frontend.test",
      SESSION_SECRET: "secret",
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_CLIENT_SECRET: "client-secret",
      SPOTIFY_REDIRECT_URI: "https://backend.test/callback",
      LASTFM_API_KEY: "lastfm-key",
      LASTFM_SHARED_SECRET: "lastfm-secret",
      LASTFM_REDIRECT_URI: "https://backend.test/lastfm/callback",
      LASTFM_USER_AGENT: "BeatRoute/Test",
      SOUNDCHARTS_APP_ID: "soundcharts-id",
      SOUNDCHARTS_API_KEY: "soundcharts-key",
    });

    expect(config.server).toEqual({
      port: 8080,
      frontendUrl: "https://frontend.test",
      sessionSecret: "secret",
      isProduction: true,
    });
    expect(config.spotify.scopes).toBe(SPOTIFY_SCOPES);
    expect(config.lastfm.userAgent).toBe("BeatRoute/Test");
  });

  it("uses documented defaults for optional values", () => {
    const config = createAppConfig();

    expect(config.server.port).toBe(3000);
    expect(config.server.isProduction).toBe(false);
    expect(config.lastfm.userAgent).toBe("BeatRoute/1.0");
    expect(config.spotify.clientId).toBe("");
  });
});
