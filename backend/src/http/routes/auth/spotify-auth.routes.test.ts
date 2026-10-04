import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { regenerateSession, saveSession } from "@http/session.js";

import { errorHandler } from "@http/error-response.js";
import { SpotifyAuthApiError } from "@integrations/spotify/spotify-auth-api.error.js";
import { createSpotifyAuthRouter } from "./spotify-auth.routes.js";
import type { RequestHandler } from "express";
import type { Session } from "express-session";
import type { SpotifyAuthClient } from "@integrations/spotify/spotify.auth.types.js";

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
    ).mockRejectedValue(
      new SpotifyAuthApiError("Invalid grant", {
        kind: "oauth",
        upstreamStatus: 400,
        oauthCode: "invalid_grant",
      })
    );
    const app = createTestApp(dependencies, setSpotifyState("state"));

    const response = await request(app)
      .get("/auth/spotify/callback")
      .query({ code: "code", state: "state" })
      .expect(400);

    expect(response.body.error.code).toBe("SPOTIFY_AUTH_API_ERROR");
    expect(dependencies.regenerate).not.toHaveBeenCalled();
  });

  it("preserves the Last.fm session when connecting Spotify", async () => {
    const lastfmSession = {
      sessionKey: "lastfm-session-key",
      username: "lastfm-user",
    };

    const app = createTestApp({
      ...createDependencies(),
      regenerate: regenerateSession,
      save: saveSession,
    });

    app.post("/test/lastfm-login", (req, res) => {
      req.session.lastfm = lastfmSession;
      res.sendStatus(204);
    });

    app.get("/test/session", (req, res) => {
      res.json({
        id: req.sessionID,
        spotify: req.session.spotify,
        lastfm: req.session.lastfm,
        spotifyAuthState: req.session.spotifyAuthState,
      });
    });

    const browser = request.agent(app);

    await browser.post("/test/lastfm-login").expect(204);
    const before = await browser.get("/test/session").expect(200);
    await browser.get("/auth/spotify/login").expect(302);

    await browser
      .get("/auth/spotify/callback")
      .query({
        code: "authorization-code",
        state: "generated-state",
      })
      .expect(302);

    const after = await browser.get("/test/session").expect(200);

    expect(after.body.id).not.toBe(before.body.id);
    expect(after.body.lastfm).toEqual(lastfmSession);

    expect(after.body.spotify).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_700_003_600_000,
      scope: "user-top-read",
      tokenType: "Bearer",
    });

    expect(after.body.spotifyAuthState).toBeUndefined();
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
});

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
