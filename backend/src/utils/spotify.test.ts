import { describe, expect, it, vi } from "vitest";

import { createRefreshAccessToken } from "./spotify.js";
import type { Request } from "express";

describe("refreshAccessToken", () => {
  it("updates access, expiry and rotated refresh tokens", async () => {
    const request = createRequestWithSpotifySession();
    const authClient = {
      refreshAccessToken: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 3600,
        scope: "user-top-read",
        token_type: "Bearer",
      }),
    };
    const refresh = createRefreshAccessToken({
      authClient,
      now: () => 1_700_000_000_000,
    });

    await refresh(request);

    expect(authClient.refreshAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(request.session.spotify).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
      expiresAt: 1_700_003_600_000,
    });
  });

  it("keeps the existing refresh token when Spotify does not rotate it", async () => {
    const request = createRequestWithSpotifySession();
    const refresh = createRefreshAccessToken({
      authClient: {
        refreshAccessToken: vi.fn().mockResolvedValue({
          access_token: "new-access-token",
          expires_in: 3600,
          scope: "user-top-read",
          token_type: "Bearer",
        }),
      },
      now: () => 0,
    });

    await refresh(request);

    expect(request.session.spotify?.refreshToken).toBe("refresh-token");
  });

  it("rejects requests without a Spotify session", async () => {
    const refresh = createRefreshAccessToken({
      authClient: { refreshAccessToken: vi.fn() },
      now: Date.now,
    });
    const request = { session: {} } as Request;

    await expect(refresh(request)).rejects.toThrow("Brak sesji Spotify");
  });
});

function createRequestWithSpotifySession(): Request {
  return {
    session: {
      spotify: {
        accessToken: "old-access-token",
        refreshToken: "refresh-token",
        expiresAt: 0,
        scope: "user-top-read",
        tokenType: "Bearer",
      },
    },
  } as Request;
}
