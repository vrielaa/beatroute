import { describe, expect, it, vi } from "vitest";

import { SpotifyReauthorizationRequiredError } from "./spotify-reauthorization-required.error.js";
import { createRefreshSpotifySession } from "./refresh-spotify-session.js";
import type { SpotifySession } from "./types.js";

describe("refreshSpotifySession", () => {
  it("updates access, expiry and rotated refresh tokens", async () => {
    const session = createSpotifySession();
    const refreshToken = vi.fn().mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
      expiresInSeconds: 3600,
      scope: "user-top-read",
      tokenType: "Bearer",
    });
    const refresh = createRefreshSpotifySession({
      refreshToken,
      now: () => 1_700_000_000_000,
    });

    const result = await refresh(session);

    expect(refreshToken).toHaveBeenCalledWith("refresh-token");
    expect(result).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
      expiresAt: 1_700_003_600_000,
    });
  });

  it("keeps the existing refresh token when Spotify does not rotate it", async () => {
    const refresh = createRefreshSpotifySession({
      refreshToken: vi.fn().mockResolvedValue({
        accessToken: "new-access-token",
        expiresInSeconds: 3600,
        scope: "user-top-read",
        tokenType: "Bearer",
      }),
      now: () => 0,
    });

    const result = await refresh(createSpotifySession());

    expect(result.refreshToken).toBe("refresh-token");
  });

  it("rejects missing Spotify session data", async () => {
    const refresh = createRefreshSpotifySession({
      refreshToken: vi.fn(),
      now: Date.now,
    });

    await expect(refresh(undefined)).rejects.toBeInstanceOf(
      SpotifyReauthorizationRequiredError
    );
  });

  it("requires reauthorization when the refresh token is missing", async () => {
    const session = createSpotifySession();
    session.refreshToken = "";
    const refresh = createRefreshSpotifySession({
      refreshToken: vi.fn(),
      now: Date.now,
    });

    await expect(refresh(session)).rejects.toBeInstanceOf(
      SpotifyReauthorizationRequiredError
    );
  });

  it("preserves token refresher failures for the calling layer", async () => {
    const error = new Error("Spotify unavailable");
    const refresh = createRefreshSpotifySession({
      refreshToken: vi.fn().mockRejectedValue(error),
      now: Date.now,
    });

    await expect(refresh(createSpotifySession())).rejects.toBe(error);
  });
});

function createSpotifySession(): SpotifySession {
  return {
    accessToken: "old-access-token",
    refreshToken: "refresh-token",
    expiresAt: 0,
    scope: "user-top-read",
    tokenType: "Bearer",
  };
}
