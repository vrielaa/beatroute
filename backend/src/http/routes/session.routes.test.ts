import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { createSessionRouter } from "./session.routes.js";
import type { RequestHandler } from "express";
import type { Session } from "express-session";

describe("session routes", () => {
  it("reports Spotify login state", async () => {
    const app = createTestApp(createDependencies(), setConnectedSessions());

    await request(app).get("/api/auth/me").expect(200, { isLoggedIn: true });

    const response = await request(app).get("/api/auth/session").expect(200);
    expect(response.body).toMatchObject({
      isLoggedIn: true,
      hasRefreshToken: true,
      isLastfmConnected: true,
    });
    expect(response.body.sessionID).toEqual(expect.any(String));
  });

  it("reports the connected Last.fm username", async () => {
    const app = createTestApp(createDependencies(), setConnectedSessions());

    await request(app).get("/api/auth/lastfm").expect(200, {
      isConnected: true,
      username: "lastfm-user",
    });
  });

  it("disconnects Last.fm without destroying the Spotify session", async () => {
    const dependencies = createDependencies();
    let savedSession: TestSession | undefined;
    dependencies.save = vi.fn(async (currentSession: Session) => {
      savedSession = currentSession as TestSession;
    });
    const app = createTestApp(dependencies, setConnectedSessions());

    await request(app).post("/api/auth/lastfm/logout").expect(200, {
      message: "Konto Last.fm zostało odłączone",
    });

    expect(savedSession?.lastfm).toBeUndefined();
    expect(savedSession?.spotify?.accessToken).toBe("access-token");
    expect(dependencies.destroy).not.toHaveBeenCalled();
  });

  it("destroys the session and clears the configured cookie", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app).post("/api/auth/logout").expect(200, {
      message: "Logged out successfully",
    });

    expect(dependencies.destroy).toHaveBeenCalledOnce();
    expect(response.headers["set-cookie"][0]).toContain("sessionId=;");
  });
});

function createDependencies() {
  return {
    save: vi.fn<(session: Session) => Promise<void>>(async () => undefined),
    destroy: vi.fn(async () => undefined),
    cookieName: "sessionId",
  };
}

function setConnectedSessions(): RequestHandler {
  return (req, _res, next) => {
    req.session.spotify = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-top-read",
      tokenType: "Bearer",
    };
    req.session.lastfm = {
      sessionKey: "lastfm-session-key",
      username: "lastfm-user",
    };
    next();
  };
}

function createTestApp(
  dependencies: Parameters<typeof createSessionRouter>[0],
  setup?: RequestHandler
) {
  const app = express();
  app.use(
    session({
      secret: "session-routes-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  if (setup) app.use(setup);
  app.use("/api/auth", createSessionRouter(dependencies));
  app.use(errorHandler);
  return app;
}

type TestSession = Session & {
  spotify?: { accessToken: string };
  lastfm?: { sessionKey: string };
};
