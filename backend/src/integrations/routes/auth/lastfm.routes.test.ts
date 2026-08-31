import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { LastfmApiError } from "../../lastfm/lastfm-api.error.js";
import { createLastfmAuthRouter } from "./lastfm.routes.js";
import type { RequestHandler } from "express";
import type { Session } from "express-session";

describe("Last.fm auth routes", () => {
  it("starts authorization with API key, callback and state", async () => {
    const dependencies = createDependencies();
    let savedSession: TestSession | undefined;
    dependencies.save = vi.fn(async (currentSession: Session) => {
      savedSession = currentSession as TestSession;
    });
    const app = createTestApp(dependencies);

    const response = await request(app).get("/auth/lastfm/login").expect(302);
    const location = new URL(response.headers.location);
    const callback = new URL(location.searchParams.get("cb")!);

    expect(location.origin + location.pathname).toBe(
      "https://lastfm.test/api/auth/"
    );
    expect(location.searchParams.get("api_key")).toBe("api-key");
    expect(callback.origin + callback.pathname).toBe(
      "http://backend.test/auth/lastfm/callback"
    );
    expect(callback.searchParams.get("state")).toBe("generated-state");
    expect(savedSession?.lastfmAuthState).toBe("generated-state");
  });

  it("reports incomplete Last.fm configuration", async () => {
    const dependencies = createDependencies();
    dependencies.assertConfig = vi.fn(() => {
      throw new Error("Missing LASTFM_API_KEY");
    });
    const app = createTestApp(dependencies);

    const response = await request(app).get("/auth/lastfm/login").expect(503);

    expect(response.body.error).toEqual({
      code: "LASTFM_CONFIGURATION_ERROR",
      message: "Missing LASTFM_API_KEY",
    });
  });

  it("creates a Last.fm session after a valid callback", async () => {
    const dependencies = createDependencies();
    let savedSession: TestSession | undefined;
    dependencies.save = vi.fn(async (currentSession: Session) => {
      savedSession = currentSession as TestSession;
    });
    const app = createTestApp(dependencies, setLastfmState("expected-state"));

    const response = await request(app)
      .get("/auth/lastfm/callback")
      .query({ token: "one-time-token", state: "expected-state" })
      .expect(302);

    expect(response.headers.location).toBe("https://frontend.test/");
    expect(dependencies.createSession).toHaveBeenCalledWith("one-time-token");
    expect(dependencies.regenerate).toHaveBeenCalledOnce();
    expect(savedSession?.lastfm).toEqual({
      sessionKey: "lastfm-session-key",
      username: "lastfm-user",
    });
    expect(savedSession?.lastfmAuthState).toBeUndefined();
  });

  it.each([
    [{}, "LASTFM_AUTH_CALLBACK_INVALID"],
    [{ token: "token", state: "wrong" }, "LASTFM_AUTH_STATE_MISMATCH"],
  ])("rejects an invalid callback %#", async (query, expectedCode) => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies, setLastfmState("expected"));

    const response = await request(app)
      .get("/auth/lastfm/callback")
      .query(query)
      .expect(400);

    expect(response.body.error.code).toBe(expectedCode);
    expect(dependencies.createSession).not.toHaveBeenCalled();
  });

  it("maps a Last.fm session API failure centrally", async () => {
    const dependencies = createDependencies();
    (dependencies.createSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new LastfmApiError("Invalid token", 4)
    );
    const app = createTestApp(dependencies, setLastfmState("state"));

    const response = await request(app)
      .get("/auth/lastfm/callback")
      .query({ token: "token", state: "state" })
      .expect(502);

    expect(response.body.error.code).toBe("LASTFM_API_ERROR");
    expect(dependencies.regenerate).not.toHaveBeenCalled();
  });
});

function createDependencies() {
  return {
    config: {
      apiKey: "api-key",
      authUrl: "https://lastfm.test/api/auth/",
      redirectUri: "http://backend.test/auth/lastfm/callback",
      frontendUrl: "https://frontend.test",
    },
    assertConfig: vi.fn(),
    createSession: vi.fn().mockResolvedValue({
      key: "lastfm-session-key",
      name: "lastfm-user",
    }),
    createState: vi.fn(() => "generated-state"),
    save: vi.fn<(session: Session) => Promise<void>>(async () => undefined),
    regenerate: vi.fn(async () => undefined),
  };
}

function setLastfmState(state: string): RequestHandler {
  return (req, _res, next) => {
    req.session.lastfmAuthState = state;
    next();
  };
}

function createTestApp(
  dependencies: Parameters<typeof createLastfmAuthRouter>[0],
  setup?: RequestHandler
) {
  const app = express();
  app.use(
    session({
      secret: "lastfm-auth-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  if (setup) app.use(setup);
  app.use("/auth/lastfm", createLastfmAuthRouter(dependencies));
  app.use(errorHandler);
  return app;
}

type TestSession = Session & {
  lastfmAuthState?: string;
  lastfm?: {
    sessionKey: string;
    username: string;
  };
};
