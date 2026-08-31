import { describe, expect, it, vi } from "vitest";

import { HttpError } from "@http/error-response.js";
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

  it("maps refresh failures to an expired session error", async () => {
    const next = vi.fn();
    const middleware = createEnsureSpotifyAccessToken({
      refresh: vi.fn().mockRejectedValue(new Error("revoked")),
      now: () => 1_000,
    });

    await middleware(createRequest(0), {} as Response, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      code: "SPOTIFY_SESSION_EXPIRED",
      status: 401,
    });
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
