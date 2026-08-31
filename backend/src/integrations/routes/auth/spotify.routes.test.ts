import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { SpotifyAuthApiError } from "../../spotify/spotify-auth-api.error.js";
import { createSpotifyAuthRouter } from "./spotify.routes.js";
import type { RequestHandler } from "express";
import type { Session } from "express-session";
import type { SpotifyAuthClient } from "../../spotify/spotify.auth.types.js";

describe("Spotify auth routes", () => {
  it("starts OAuth with the configured parameters and stores state", async () => {
    const dependencies = createDependencies();
    let savedSession: TestSession | undefined;
    dependencies.save = vi.fn(async (currentSession: Session) => {
      savedSession = currentSession as TestSession;
    });
    const app = createTestApp(dependencies);

    const response = await request(app).get("/auth/spotify/login").expect(302);
    const location = new URL(response.headers.location);

    expect(location.origin + location.pathname).toBe(
      "https://accounts.spotify.com/authorize"
    );
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://backend.test/auth/spotify/callback"
    );
    expect(location.searchParams.get("scope")).toBe(
      "user-top-read user-read-private"
    );
    expect(location.searchParams.get("state")).toBe("generated-state");
    expect(savedSession?.spotifyAuthState).toBe("generated-state");
  });

  it("exchanges a valid callback code, regenerates the session and stores tokens", async () => {
    const dependencies = createDependencies();
    let savedSession: TestSession | undefined;
    dependencies.save = vi.fn(async (currentSession: Session) => {
      savedSession = currentSession as TestSession;
    });
    const app = createTestApp(dependencies, setSpotifyState("expected-state"));

    const response = await request(app)
      .get("/auth/spotify/callback")
      .query({ code: "authorization-code", state: "expected-state" })
      .expect(302);

    expect(response.headers.location).toBe("https://frontend.test/");
    expect(
      dependencies.authClient.exchangeAuthorizationCode
    ).toHaveBeenCalledWith("authorization-code");
    expect(dependencies.regenerate).toHaveBeenCalledOnce();
    expect(savedSession?.spotify).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_003_600_000,
      scope: "user-top-read",
      tokenType: "Bearer",
    });
    expect(savedSession?.spotifyAuthState).toBeUndefined();
  });

  it.each([
    [{}, "SPOTIFY_AUTH_CALLBACK_INVALID"],
    [{ code: "code", state: "wrong-state" }, "SPOTIFY_AUTH_STATE_MISMATCH"],
    [{ error: "access_denied" }, "SPOTIFY_AUTH_DENIED"],
  ])("rejects an invalid callback %#", async (query, expectedCode) => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies, setSpotifyState("expected-state"));

    const response = await request(app)
      .get("/auth/spotify/callback")
      .query(query)
      .expect(400);

    expect(response.body.error.code).toBe(expectedCode);
    expect(
      dependencies.authClient.exchangeAuthorizationCode
    ).not.toHaveBeenCalled();
  });

  it("maps a Spotify token endpoint error through the central handler", async () => {
    const dependencies = createDependencies();
    (
      dependencies.authClient.exchangeAuthorizationCode as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new SpotifyAuthApiError("Invalid grant", 400));
    const app = createTestApp(dependencies, setSpotifyState("state"));

    const response = await request(app)
      .get("/auth/spotify/callback")
      .query({ code: "code", state: "state" })
      .expect(400);

    expect(response.body.error.code).toBe("SPOTIFY_AUTH_API_ERROR");
    expect(dependencies.regenerate).not.toHaveBeenCalled();
  });
});

function createDependencies() {
  const authClient = {
    exchangeAuthorizationCode: vi.fn().mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "user-top-read",
      token_type: "Bearer",
    }),
    refreshAccessToken: vi.fn(),
  } as unknown as SpotifyAuthClient;

  return {
    authClient,
    config: {
      clientId: "client-id",
      redirectUri: "http://backend.test/auth/spotify/callback",
      frontendUrl: "https://frontend.test",
      scopes: ["user-top-read", "user-read-private"],
    },
    createState: vi.fn(() => "generated-state"),
    save: vi.fn<(session: Session) => Promise<void>>(async () => undefined),
    regenerate: vi.fn(async () => undefined),
    now: vi.fn(() => 1_700_000_000_000),
  };
}

function setSpotifyState(state: string): RequestHandler {
  return (req, _res, next) => {
    req.session.spotifyAuthState = state;
    next();
  };
}

function createTestApp(
  dependencies: Parameters<typeof createSpotifyAuthRouter>[0],
  setup?: RequestHandler
) {
  const app = express();
  app.use(
    session({
      secret: "spotify-auth-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  if (setup) app.use(setup);
  app.use("/auth/spotify", createSpotifyAuthRouter(dependencies));
  app.use(errorHandler);
  return app;
}

type TestSession = Session & {
  spotifyAuthState?: string;
  spotify?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scope: string;
    tokenType: string;
  };
};
