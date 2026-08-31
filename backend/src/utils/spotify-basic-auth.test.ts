import { describe, expect, it } from "vitest";

import { getSpotifyBasicAuthHeader } from "./spotify-basic-auth.js";

describe("getSpotifyBasicAuthHeader", () => {
  it("encodes the client ID and secret using HTTP Basic authentication", () => {
    expect(
      getSpotifyBasicAuthHeader({ clientId: "client", clientSecret: "secret" })
    ).toBe(`Basic ${Buffer.from("client:secret").toString("base64")}`);
  });
});
