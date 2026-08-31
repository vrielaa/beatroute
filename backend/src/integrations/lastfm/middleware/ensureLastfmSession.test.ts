import { describe, expect, it, vi } from "vitest";

import ensureLastfmSession from "./ensureLastfmSession.js";
import type { Request, Response } from "express";

describe("ensureLastfmSession", () => {
  it("rejects a request without a complete Last.fm session", () => {
    const next = vi.fn();

    ensureLastfmSession({ session: {} } as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LASTFM_AUTH_REQUIRED", status: 401 })
    );
  });

  it("passes a request with a session key and username", () => {
    const next = vi.fn();
    const request = {
      session: {
        lastfm: { sessionKey: "session-key", username: "user" },
      },
    } as Request;

    ensureLastfmSession(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
