import { describe, expect, it } from "vitest";

import { assertLastfmConfig } from "./lastfm.config.js";

describe("assertLastfmConfig", () => {
  const completeConfig = {
    apiRoot: "https://lastfm.test",
    authUrl: "https://lastfm.test/auth",
    apiKey: "api-key",
    sharedSecret: "shared-secret",
    redirectUri: "https://app.test/callback",
    userAgent: "BeatRoute/Test",
  };

  it("accepts complete Last.fm configuration", () => {
    expect(() => assertLastfmConfig(completeConfig)).not.toThrow();
  });

  it.each(["apiKey", "sharedSecret", "redirectUri"] as const)(
    "rejects an empty %s",
    (property) => {
      expect(() =>
        assertLastfmConfig({ ...completeConfig, [property]: "" })
      ).toThrow("Brakuje zmiennej środowiskowej Last.fm");
    }
  );
});
