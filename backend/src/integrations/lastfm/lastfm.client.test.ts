import { describe, expect, it, vi } from "vitest";

import { LastfmApiError } from "./lastfm-api.error.js";
import {
  createLastfmApiSignature,
  createLastfmClient,
} from "./lastfm.client.js";

const config = {
  apiRoot: "https://lastfm.test/2.0/",
  authUrl: "https://lastfm.test/auth",
  apiKey: "api-key",
  sharedSecret: "shared-secret",
  redirectUri: "https://app.test/auth/lastfm/callback",
  userAgent: "BeatRoute/Test",
};

describe("Last.fm client", () => {
  it("creates a stable signature independent of parameter order", () => {
    const first = createLastfmApiSignature(
      {
        method: "artist.getInfo",
        artist: "Cher",
        api_key: "key",
        format: "json",
      },
      { sharedSecret: "secret" }
    );
    const second = createLastfmApiSignature(
      {
        format: "json",
        api_key: "key",
        artist: "Cher",
        method: "artist.getInfo",
      },
      { sharedSecret: "secret" }
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
  });

  it("sends an unsigned GET request with common parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ artist: { name: "Cher" } }));
    const client = createLastfmClient({ fetchImpl: fetchMock, config });

    await expect(client("artist.getInfo", { artist: "Cher" })).resolves.toEqual(
      {
        artist: { name: "Cher" },
      }
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("api_key=api-key");
    expect(String(url)).toContain("method=artist.getInfo");
    expect(String(url)).toContain("artist=Cher");
    expect(options).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "BeatRoute/Test" },
    });
  });

  it("puts signed POST parameters in the request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { key: "key" } }));
    const client = createLastfmClient({ fetchImpl: fetchMock, config });

    await client(
      "auth.getSession",
      { token: "token" },
      { signed: true, httpMethod: "POST" }
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(config.apiRoot);
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(URLSearchParams);
    expect(options.body.get("api_sig")).toMatch(/^[a-f0-9]{32}$/);
    expect(options.body.get("format")).toBe("json");
  });

  it("maps Last.fm error responses to LastfmApiError", async () => {
    const client = createLastfmClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 10, message: "Invalid API key" }, 400)
        ),
      config,
    });

    await expect(client("artist.getInfo")).rejects.toMatchObject({
      name: "LastfmApiError",
      code: 10,
      message: "Invalid API key",
    });
  });

  it("rejects non-JSON and network failures consistently", async () => {
    const invalidJsonClient = createLastfmClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response("not-json")),
      config,
    });
    const networkClient = createLastfmClient({
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
      config,
    });

    await expect(invalidJsonClient("user.getInfo")).rejects.toBeInstanceOf(
      LastfmApiError
    );
    await expect(networkClient("user.getInfo")).rejects.toMatchObject({
      name: "LastfmApiError",
      message: "Nie udało się połączyć z Last.fm",
    });
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
