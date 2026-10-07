import { describe, expect, it, vi } from "vitest";

import { SpotifyAuthApiError } from "./api-error.js";
import { createSpotifyAuthClient } from "./client.js";
import { createRequestScheduler } from "@integrations/request-scheduler.js";
import type { SpotifyTokenResponse } from "./types.js";

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

  it("routes token requests through an injected scheduler", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const scheduleSpy = vi.spyOn(scheduler, "schedule");
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(createTokenResponse())),
      basicAuthHeader: "Basic credentials",
      scheduler,
    });

    await client.refreshAccessToken("refresh-token");

    expect(scheduleSpy).toHaveBeenCalledOnce();
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
      kind: "oauth",
      upstreamStatus: 400,
      oauthCode: "invalid_grant",
      data: errorData,
    });
  });

  it("classifies connection failures without treating them as expired sessions", async () => {
    const connectionError = new TypeError("fetch failed");
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockRejectedValue(connectionError),
      basicAuthHeader: "Basic credentials",
    });

    await expect(
      client.refreshAccessToken("refresh-token")
    ).rejects.toMatchObject({
      kind: "network",
      upstreamStatus: null,
      oauthCode: null,
      originalCause: connectionError,
    });
  });

  it("classifies a request timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockRejectedValue(timeoutError),
      basicAuthHeader: "Basic credentials",
    });

    await expect(
      client.refreshAccessToken("refresh-token")
    ).rejects.toMatchObject({
      kind: "timeout",
      upstreamStatus: null,
    });
  });

  it("preserves rate-limit information returned by Spotify", async () => {
    const scheduler = createRequestScheduler({ maxConcurrentRequests: 1 });
    const pauseSpy = vi.spyOn(scheduler, "pauseFor");
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "temporarily_unavailable",
            error_description: "Try again later",
          },
          {
            status: 429,
            headers: { "Retry-After": "30" },
          }
        )
      ),
      basicAuthHeader: "Basic credentials",
      scheduler,
    });

    await expect(
      client.refreshAccessToken("refresh-token")
    ).rejects.toMatchObject({
      kind: "oauth",
      upstreamStatus: 429,
      oauthCode: "temporarily_unavailable",
      retryAfterSeconds: 30,
    });
    expect(pauseSpy).toHaveBeenCalledWith(30_000);
  });

  it("rejects a non-JSON response", async () => {
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("temporary proxy error", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        })
      ),
      basicAuthHeader: "Basic credentials",
    });

    await expect(
      client.refreshAccessToken("refresh-token")
    ).rejects.toMatchObject({
      kind: "invalid-response",
      upstreamStatus: 502,
    });
  });

  it("rejects a successful response without required token fields", async () => {
    const client = createSpotifyAuthClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse({ access_token: "access-token" })),
      basicAuthHeader: "Basic credentials",
    });

    const request = client.refreshAccessToken("refresh-token");

    await expect(request).rejects.toMatchObject({
      kind: "invalid-response",
      upstreamStatus: 200,
      data: {
        receivedType: "object",
        receivedFields: ["access_token"],
      },
    });
    await expect(request).rejects.not.toHaveProperty(
      "data.access_token",
      "access-token"
    );
  });

  it("requires a refresh token after exchanging an authorization code", async () => {
    const client = createSpotifyAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(createTokenResponse())),
      basicAuthHeader: "Basic credentials",
      redirectUri: "https://app.test/auth/spotify/callback",
    });

    await expect(
      client.exchangeAuthorizationCode("authorization-code")
    ).rejects.toMatchObject({
      kind: "invalid-response",
      upstreamStatus: 200,
    });
  });
});

function createTokenResponse(overrides: Partial<SpotifyTokenResponse> = {}) {
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
