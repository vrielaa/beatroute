import { describe, expect, it, vi } from "vitest";

import { SpotifyReauthorizationRequiredError } from "@application/auth/spotify-reauthorization-required.error.js";
import { SpotifyAuthApiError } from "./api-error.js";
import { createSpotifyTokenRefresher } from "./token-refresher.js";

describe("Spotify token refresher", () => {
  it("maps the Spotify response to the application contract", async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "user-top-read",
      token_type: "Bearer",
    });
    const refreshToken = createSpotifyTokenRefresher({ refreshAccessToken });

    await expect(refreshToken("old-refresh-token")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresInSeconds: 3600,
      scope: "user-top-read",
      tokenType: "Bearer",
    });
  });

  it("translates invalid_grant to a reauthorization requirement", async () => {
    const refreshToken = createSpotifyTokenRefresher({
      refreshAccessToken: vi.fn().mockRejectedValue(
        new SpotifyAuthApiError("Refresh token expired", {
          kind: "oauth",
          upstreamStatus: 400,
          oauthCode: "invalid_grant",
        })
      ),
    });

    await expect(refreshToken("revoked-token")).rejects.toBeInstanceOf(
      SpotifyReauthorizationRequiredError
    );
  });

  it("preserves temporary Spotify failures", async () => {
    const error = new SpotifyAuthApiError("Spotify unavailable", {
      kind: "network",
    });
    const refreshToken = createSpotifyTokenRefresher({
      refreshAccessToken: vi.fn().mockRejectedValue(error),
    });

    await expect(refreshToken("refresh-token")).rejects.toBe(error);
  });
});
