import { describe, expect, it, vi } from "vitest";

import { createSoundchartsClient } from "./client.js";
import { SoundchartsApiError } from "./soundcharts-api.error.js";

describe("Soundcharts client", () => {
  it("sends credentials and returns a successful response", async () => {
    const data = { type: "song", object: { uuid: "uuid" } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(data));
    const request = createSoundchartsClient({
      fetchImpl: fetchMock,
      baseUrl: "https://soundcharts.test",
      appId: "app-id",
      apiKey: "api-key",
    });

    await expect(request("/song/1")).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://soundcharts.test/song/1",
      expect.objectContaining({
        headers: {
          "x-app-id": "app-id",
          "x-api-key": "api-key",
          Accept: "application/json",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("maps an unsuccessful response to SoundchartsApiError", async () => {
    const request = createSoundchartsClient({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { errors: [{ key: "auth", code: 401, message: "Invalid key" }] },
            401
          )
        ),
    });

    await expect(request("/song/1")).rejects.toMatchObject({
      name: "SoundchartsApiError",
      message: "Invalid key",
      upstreamStatus: 401,
    });
  });

  it("maps invalid JSON and network failures consistently", async () => {
    const invalidJsonRequest = createSoundchartsClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response("invalid")),
    });
    const networkRequest = createSoundchartsClient({
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await expect(invalidJsonRequest("/song/1")).rejects.toBeInstanceOf(
      SoundchartsApiError
    );
    await expect(networkRequest("/song/1")).rejects.toMatchObject({
      message: "Nie udało się połączyć z Soundcharts",
    });
  });

  it("preserves Retry-After from the final rate-limit response", async () => {
    const request = createSoundchartsClient({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ message: "Too many requests" }],
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "20",
            },
          }
        )
      ),
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(request("/song/1")).rejects.toMatchObject({
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 20,
    });
  });

  it("classifies an exhausted request timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    const request = createSoundchartsClient({
      fetchImpl: vi.fn().mockRejectedValue(timeoutError),
      requestPolicy: { maxAttempts: 1 },
    });

    await expect(request("/song/1")).rejects.toMatchObject({
      category: "timeout",
      upstreamStatus: 504,
      details: timeoutError,
    });
  });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
