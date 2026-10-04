import { describe, expect, it, vi } from "vitest";

import { HttpError } from "@http/error-response.js";
import { SpotifyAuthApiError } from "../spotify-auth-api.error.js";
import { SpotifyReauthorizationRequiredError } from "../spotify-reauthorization-required.error.js";
import { createEnsureSpotifyAccessToken } from "./ensureSpotifyAccessToken.js";
import type { NextFunction, Request, Response } from "express";

describe("ensureSpotifyAccessToken", () => {
  it("rejects a request without an access token", async () => {
    const refresh = vi.fn();
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh,
      now: () => 0,
    });

    await middleware(createRequest(), {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SPOTIFY_AUTH_REQUIRED", status: 401 })
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("passes a request with a token that remains valid for over one minute", async () => {
    const refresh = vi.fn();
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh,
      now: () => 1_000,
    });

    await middleware(createRequest(62_000), {} as Response, next);

    expect(refresh).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("refreshes a token within the one-minute expiry window", async () => {
    const request = createRequest(60_000);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh,
      now: () => 1_000,
    });

    await middleware(request, {} as Response, next);

    expect(refresh).toHaveBeenCalledWith(request);
    expect(next).toHaveBeenCalledWith();
  });

  it("removes the Spotify session when reauthorization is required", async () => {
    const request = createRequest(0);
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh: vi
        .fn()
        .mockRejectedValue(new SpotifyReauthorizationRequiredError()),
      now: () => 1_000,
    });

    await middleware(request, {} as Response, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      code: "SPOTIFY_REAUTH_REQUIRED",
      status: 401,
    });
    expect(request.session.spotify).toBeUndefined();
  });

  it("forwards temporary Spotify failures without removing the session", async () => {
    const request = createRequest(0);
    const apiError = new SpotifyAuthApiError("Spotify unavailable", {
      kind: "network",
    });
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh: vi.fn().mockRejectedValue(apiError),
      now: () => 1_000,
    });

    await middleware(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(apiError);
    expect(request.session.spotify).toBeDefined();
  });

  it("forwards unexpected errors instead of presenting them as an expired session", async () => {
    const unexpectedError = new Error("programming error");
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh: vi.fn().mockRejectedValue(unexpectedError),
      now: () => 1_000,
    });

    await middleware(createRequest(0), {} as Response, next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
  });
});

function createRequest(expiresAt?: number): Request {
  return {
    session: {
      ...(expiresAt === undefined
        ? {}
        : {
            spotify: {
              accessToken: "access-token",
              refreshToken: "refresh-token",
              expiresAt,
              scope: "user-top-read",
              tokenType: "Bearer",
            },
          }),
    },
  } as Request;
}
