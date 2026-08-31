import { describe, expect, it, vi } from "vitest";

import { createSpotifyAuthClient } from "./spotify.auth.client.js";
import { SpotifyAuthApiError } from "./spotify-auth-api.error.js";

describe("Spotify auth client", () => {
  it("exchanges an authorization code for tokens", async () => {
    const tokenResponse = createTokenResponse({
      refresh_token: "refresh-token",
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));
    const client = createSpotifyAuthClient({
      fetchImpl: fetchMock,
      tokenUrl: "https://spotify.test/api/token",
      basicAuthHeader: "Basic credentials",
      redirectUri: "https://app.test/auth/spotify/callback",
    });

    await expect(
      client.exchangeAuthorizationCode("authorization-code")
    ).resolves.toEqual(tokenResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spotify.test/api/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Basic credentials",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
    );
    expect(getRequestBody(fetchMock)).toBe(
      "grant_type=authorization_code&code=authorization-code&redirect_uri=https%3A%2F%2Fapp.test%2Fauth%2Fspotify%2Fcallback"
    );
  });

  it("refreshes an access token without requiring a new refresh token", async () => {
    const tokenResponse = createTokenResponse();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));
    const client = createSpotifyAuthClient({
      fetchImpl: fetchMock,
      tokenUrl: "https://spotify.test/api/token",
      basicAuthHeader: "Basic credentials",
      redirectUri: "https://app.test/auth/spotify/callback",
    });

    await expect(client.refreshAccessToken("refresh-token")).resolves.toEqual(
      tokenResponse
    );
    expect(getRequestBody(fetchMock)).toBe(
      "grant_type=refresh_token&refresh_token=refresh-token"
    );
  });

  it("throws a typed error containing the Spotify response", async () => {
    const errorData = {
      error: "invalid_grant",
      error_description: "Refresh token revoked",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorData, { status: 400 }));
    const client = createSpotifyAuthClient({
      fetchImpl: fetchMock,
      tokenUrl: "https://spotify.test/api/token",
      basicAuthHeader: "Basic credentials",
      redirectUri: "https://app.test/auth/spotify/callback",
    });

    const request = client.refreshAccessToken("revoked-token");

    await expect(request).rejects.toBeInstanceOf(SpotifyAuthApiError);
    await expect(request).rejects.toMatchObject({
      message: "Refresh token revoked",
      status: 400,
      data: errorData,
    });
  });
});

function createTokenResponse(overrides: Record<string, string> = {}) {
  return {
    access_token: "access-token",
    token_type: "Bearer",
    scope: "user-top-read",
    expires_in: 3600,
    ...overrides,
  };
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function getRequestBody(fetchMock: ReturnType<typeof vi.fn>): string {
  const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;

  return String(requestOptions.body);
}
