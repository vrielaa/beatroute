import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";
import { createReccoBeatsService } from "./reccobeats.service.js";
import { ReccoBeatsApiError } from "./reccobeats-api.error.js";

afterEach(() => vi.restoreAllMocks());

describe("ReccoBeats service", () => {
  it("finds a track by Spotify ID and returns its normalized features", async () => {
    const { service, gateway } = createService();
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockResolvedValue({
      tempo: 128,
    });

    const result = await service.getTrackAudioFeaturesBySpotifyId("spotify1");

    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledWith(["spotify1"]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledWith("recco1");
    expect(result).toMatchObject({
      id: "recco1",
      spotifyId: "spotify1",
      tempo: 128,
      energy: null,
    });
  });

  it("rejects when ReccoBeats cannot match a Spotify track", async () => {
    const { service, gateway } = createService();
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([]);

    await expect(
      service.getTrackAudioFeaturesBySpotifyId("missing")
    ).rejects.toThrow("ReccoBeats track not found for Spotify ID: missing");
    expect(gateway.getTrackAudioFeatures).not.toHaveBeenCalled();
  });

  it("propagates an audio-features error for a single track", async () => {
    const { service, gateway } = createService();
    const requestError = new Error("Audio features unavailable");
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockRejectedValue(requestError);

    await expect(
      service.getTrackAudioFeaturesBySpotifyId("spotify1")
    ).rejects.toBe(requestError);
  });

  it("preserves input order and reports failures for individual tracks", async () => {
    const { service, gateway } = createService();
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
      createTrack("recco3", "spotify3"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockImplementation(
      async (reccoBeatsId: string) => {
        if (reccoBeatsId === "recco3") {
          throw new Error("Audio features unavailable");
        }

        return { tempo: 120, energy: 0.75 };
      }
    );

    const result = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "spotify1",
      "missing",
      "spotify3",
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id: "recco1",
        spotifyId: "spotify1",
        tempo: 120,
        energy: 0.75,
      }),
      {
        spotifyId: "missing",
        error: "ReccoBeats track not found",
      },
      {
        spotifyId: "spotify3",
        error: "Audio features unavailable",
      },
    ]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("propagates an error from the initial track lookup", async () => {
    const { service, gateway } = createService();
    const requestError = new Error("ReccoBeats unavailable");
    vi.mocked(gateway.findTracksBySpotifyIds).mockRejectedValue(requestError);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["spotify1"])
    ).rejects.toBe(requestError);
    expect(gateway.getTrackAudioFeatures).not.toHaveBeenCalled();
  });

  it.each([429, 500, 502, 503, 504])(
    "propagates the original HTTP %s failure when every audio request fails",
    async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { service, gateway } = createService();
      const requestError = new ReccoBeatsApiError(
        "API unavailable",
        status,
        null,
        {
          retryAfterSeconds: status === 429 ? 30 : null,
        }
      );
      vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
        createTrack("recco1", "spotify1"),
        createTrack("recco2", "spotify2"),
      ]);
      vi.mocked(gateway.getTrackAudioFeatures).mockRejectedValue(requestError);

      await expect(
        service.getManyTrackAudioFeaturesBySpotifyIds(["spotify1", "spotify2"])
      ).rejects.toBe(requestError);
      expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
    }
  );

  it("does not hide an outage when other IDs are not present in the catalog", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, gateway } = createService();
    const requestError = new ReccoBeatsApiError("API unavailable", 503, null);
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockRejectedValue(requestError);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["missing", "spotify1"])
    ).rejects.toBe(requestError);
  });

  it("retains per-track failures for unavailable measurements with status 404", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, gateway } = createService();
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockRejectedValue(
      new ReccoBeatsApiError("Measurements not found", 404, null)
    );

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["spotify1", "missing"])
    ).resolves.toEqual([
      { spotifyId: "spotify1", error: "Measurements not found" },
      { spotifyId: "missing", error: "ReccoBeats track not found" },
    ]);
  });

  it("propagates an invalid 404 response rather than treating it as known missing measurements", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, gateway } = createService();
    const requestError = new ReccoBeatsApiError("Not JSON", 404, null, {
      category: "invalid-response",
    });
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([
      createTrack("recco1", "spotify1"),
    ]);
    vi.mocked(gateway.getTrackAudioFeatures).mockRejectedValue(requestError);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["spotify1"])
    ).rejects.toBe(requestError);
  });

  it("reports an entirely unmatched catalog without inventing an API failure", async () => {
    const { service, gateway } = createService();
    vi.mocked(gateway.findTracksBySpotifyIds).mockResolvedValue([]);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["missing"])
    ).resolves.toEqual([
      { spotifyId: "missing", error: "ReccoBeats track not found" },
    ]);
    expect(gateway.getTrackAudioFeatures).not.toHaveBeenCalled();
  });
});

function createService() {
  const gateway: ReccoBeatsGateway = {
    findTracksBySpotifyIds: vi.fn(),
    getTrackAudioFeatures: vi.fn(),
  };

  return {
    gateway,
    service: createReccoBeatsService({ reccoBeatsGateway: gateway }),
  };
}

function createTrack(id: string, spotifyId: string) {
  return {
    id,
    href: `https://open.spotify.com/track/${spotifyId}`,
    name: `Track ${spotifyId}`,
  };
}
