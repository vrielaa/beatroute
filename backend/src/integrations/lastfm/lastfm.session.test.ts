import { describe, expect, it, vi } from "vitest";

import { LastfmApiError } from "./lastfm-api.error.js";
import { createLastfmSessionExchange } from "./lastfm.session.js";

describe("Last.fm session exchange", () => {
  it("creates a session using a signed request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ session: { key: "session-key", name: "user" } });
    const createSession = createLastfmSessionExchange(request);

    await expect(createSession("token")).resolves.toEqual({
      key: "session-key",
      name: "user",
    });
    expect(request).toHaveBeenCalledWith(
      "auth.getSession",
      { token: "token" },
      { signed: true }
    );
  });

  it("rejects an incomplete session response", async () => {
    const createSession = createLastfmSessionExchange(
      vi.fn().mockResolvedValue({ session: {} })
    );

    await expect(createSession("token")).rejects.toBeInstanceOf(LastfmApiError);
  });
});
