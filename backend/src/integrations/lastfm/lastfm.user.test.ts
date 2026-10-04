import { describe, expect, it, vi } from "vitest";

import { LastfmApiError } from "./lastfm-api.error.js";
import { createLastfmUserReader } from "./lastfm.user.js";

describe("Last.fm user reader", () => {
  it("returns a Last.fm user profile", async () => {
    const user = {
      name: "user",
      url: "https://last.fm/user/user",
      image: "image",
    };
    const request = vi.fn().mockResolvedValue({ user });
    const getUserInfo = createLastfmUserReader(request);

    await expect(getUserInfo("user")).resolves.toEqual(user);
    expect(request).toHaveBeenCalledWith("user.getInfo", { user: "user" });
  });

  it("rejects an incomplete user response", async () => {
    const getUserInfo = createLastfmUserReader(vi.fn().mockResolvedValue({}));

    await expect(getUserInfo("user")).rejects.toBeInstanceOf(LastfmApiError);
  });
});
