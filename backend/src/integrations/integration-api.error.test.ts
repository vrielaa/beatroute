import { describe, expect, it } from "vitest";
import { IntegrationApiError } from "./integration-api.error.js";

describe("IntegrationApiError", () => {
  it("stores the retry delay returned by an external API", () => {
    const error = new IntegrationApiError("reccobeats", "Rate limited", {
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 30,
    });

    expect(error.retryAfterSeconds).toBe(30);
  });

  it("uses null when the external API does not provide a retry delay", () => {
    const error = new IntegrationApiError("lastfm", "Request failed");

    expect(error.retryAfterSeconds).toBeNull();
  });
});
