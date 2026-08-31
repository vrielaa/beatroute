import { describe, expect, it, vi } from "vitest";

import { LastfmApiError } from "./lastfm-api.error.js";
import { createLastfmService } from "./lastfm.service.js";

describe("Last.fm service", () => {
  it("creates a session using a signed request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ session: { key: "session-key", name: "user" } });
    const service = createLastfmService(request);

    await expect(service.createLastfmSession("token")).resolves.toEqual({
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
    const service = createLastfmService(
      vi.fn().mockResolvedValue({ session: {} })
    );

    await expect(service.createLastfmSession("token")).rejects.toBeInstanceOf(
      LastfmApiError
    );
  });

  it("returns a Last.fm user profile", async () => {
    const user = {
      name: "user",
      url: "https://last.fm/user/user",
      image: "image",
    };
    const request = vi.fn().mockResolvedValue({ user });
    const service = createLastfmService(request);

    await expect(service.getLastfmUserInfo("user")).resolves.toEqual(user);
    expect(request).toHaveBeenCalledWith("user.getInfo", { user: "user" });
  });

  it("rejects an incomplete user response", async () => {
    const service = createLastfmService(vi.fn().mockResolvedValue({}));

    await expect(service.getLastfmUserInfo("user")).rejects.toBeInstanceOf(
      LastfmApiError
    );
  });
});
