import { describe, expect, it, vi } from "vitest";

import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";
import { createReccoBeatsService } from "./reccobeats.service.js";

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
