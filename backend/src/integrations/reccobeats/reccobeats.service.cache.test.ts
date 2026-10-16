import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";
import { ReccoBeatsApiError } from "./reccobeats-api.error.js";
import { createReccoBeatsService } from "./reccobeats.service.js";

const dayMs = 24 * 60 * 60 * 1_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ReccoBeats audio features cache", () => {
  it("skips both provider operations when all requested tracks are cached", async () => {
    const { service, gateway } = createService();
    const first = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "one",
      "two",
    ]);

    const second = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "one",
      "two",
    ]);

    expect(second).toEqual(first);
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledExactlyOnceWith([
      "one",
      "two",
    ]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("requests only cache misses and preserves the original order", async () => {
    const { service, gateway } = createService();
    await service.getManyTrackAudioFeaturesBySpotifyIds(["one", "two"]);

    const result = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "two",
      "three",
      "one",
    ]);

    expect(result.map((track) => track.spotifyId)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(gateway.findTracksBySpotifyIds).toHaveBeenLastCalledWith(["three"]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(3);
    expect(gateway.getTrackAudioFeatures).toHaveBeenLastCalledWith(
      "recco-three"
    );
  });

  it("shares cached measurements between single and batch reads in both directions", async () => {
    const { service, gateway } = createService();
    const one = await service.getTrackAudioFeaturesBySpotifyId("one");
    const batch = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "one",
      "two",
    ]);
    const two = await service.getTrackAudioFeaturesBySpotifyId("two");

    expect(batch).toEqual([one, two]);
    expect(gateway.findTracksBySpotifyIds.mock.calls).toEqual([
      [["one"]],
      [["two"]],
    ]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("does not share cache entries between service instances", async () => {
    const { service, gateway } = createService();
    await service.getTrackAudioFeaturesBySpotifyId("one");
    const anotherService = createReccoBeatsService({
      reccoBeatsGateway: gateway,
    });

    await anotherService.getTrackAudioFeaturesBySpotifyId("one");

    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("expires exactly 24 hours after retrieval without extending the TTL on a cache hit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { service, gateway } = createService();
    await service.getTrackAudioFeaturesBySpotifyId("one");

    vi.setSystemTime(dayMs - 1);
    await service.getTrackAudioFeaturesBySpotifyId("one");
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledOnce();

    vi.setSystemTime(dayMs);
    gateway.getTrackAudioFeatures.mockResolvedValueOnce({ tempo: 140 });
    const refreshed = await service.getTrackAudioFeaturesBySpotifyId("one");
    expect(refreshed.tempo).toBe(140);
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("removes the oldest entry when a 1001st track is cached", async () => {
    const { service, gateway } = createService();
    const ids = Array.from({ length: 1_001 }, (_, index) => `track${index}`);
    await service.getManyTrackAudioFeaturesBySpotifyIds(ids);

    await service.getTrackAudioFeaturesBySpotifyId("track1000");
    await service.getTrackAudioFeaturesBySpotifyId("track500");
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(1_001);

    await service.getTrackAudioFeaturesBySpotifyId("track0");
    expect(gateway.findTracksBySpotifyIds).toHaveBeenLastCalledWith(["track0"]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(1_002);
  });

  it("returns independent copies on fresh reads, cache hits and repeated IDs", async () => {
    const { service, gateway } = createService();
    const first = await service.getTrackAudioFeaturesBySpotifyId("one");
    first.tempo = 999;
    first.spotifyId = "changed";

    const cached = await service.getTrackAudioFeaturesBySpotifyId("one");
    expect(cached.tempo).toBe(128);
    expect(cached.spotifyId).toBe("one");
    cached.energy = 0;

    const repeated = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "one",
      "one",
    ]);
    expect(repeated[0]).toEqual(repeated[1]);
    expect(repeated[0]).not.toBe(repeated[1]);
    if ("error" in repeated[0]) throw new Error("Expected measurements");
    repeated[0].energy = 0;
    expect(repeated[1]).toHaveProperty("energy", 0.8);
    const next = await service.getTrackAudioFeaturesBySpotifyId("one");
    expect(next.energy).toBe(0.8);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledOnce();
  });

  it("keeps partial measurements and zero as a valid cached read", async () => {
    const { service, gateway } = createService();
    gateway.getTrackAudioFeatures.mockResolvedValue({ energy: 0, tempo: null });
    const first = await service.getTrackAudioFeaturesBySpotifyId("one");

    const cached = await service.getTrackAudioFeaturesBySpotifyId("one");

    expect(cached).toEqual(first);
    expect(cached).toMatchObject({ energy: 0, tempo: null, valence: null });
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledOnce();
  });

  it.each([{}, { tempo: null, energy: null }])(
    "does not cache a response without any measurement: %j",
    async (response) => {
      const { service, gateway } = createService();
      gateway.getTrackAudioFeatures.mockResolvedValue(response);

      await service.getTrackAudioFeaturesBySpotifyId("one");
      await service.getTrackAudioFeaturesBySpotifyId("one");

      expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
      expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
    }
  );

  it("does not cache catalog misses and can find the track on the next request", async () => {
    const { service, gateway } = createService();
    gateway.findTracksBySpotifyIds.mockResolvedValueOnce([]);
    await expect(
      service.getTrackAudioFeaturesBySpotifyId("one")
    ).rejects.toThrow("not found");

    const next = await service.getTrackAudioFeaturesBySpotifyId("one");

    expect(next.spotifyId).toBe("one");
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledOnce();
  });

  it("does not associate another track's measurements with the requested cache key", async () => {
    const { service, gateway } = createService();
    gateway.findTracksBySpotifyIds.mockResolvedValueOnce([
      { id: "recco-other", href: "https://open.spotify.com/track/other" },
    ]);
    await expect(
      service.getTrackAudioFeaturesBySpotifyId("one")
    ).rejects.toThrow("not found");
    expect(gateway.getTrackAudioFeatures).not.toHaveBeenCalled();

    const next = await service.getTrackAudioFeaturesBySpotifyId("one");

    expect(next).toMatchObject({ spotifyId: "one", id: "recco-one" });
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
  });

  it.each([
    new ReccoBeatsApiError("Not found", 404, null),
    new ReccoBeatsApiError("Rate limited", 429, null, {
      retryAfterSeconds: 10,
    }),
    new ReccoBeatsApiError("Timed out", 504, null, { category: "timeout" }),
    new ReccoBeatsApiError("Unavailable", 503, null),
    new ReccoBeatsApiError("Invalid response", 200, null, {
      category: "invalid-response",
    }),
  ])("does not cache a failed audio read: %s", async (error) => {
    const { service, gateway } = createService();
    gateway.getTrackAudioFeatures.mockRejectedValueOnce(error);
    await expect(service.getTrackAudioFeaturesBySpotifyId("one")).rejects.toBe(
      error
    );

    const next = await service.getTrackAudioFeaturesBySpotifyId("one");

    expect(next.spotifyId).toBe("one");
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed catalog search", async () => {
    const { service, gateway } = createService();
    const error = new ReccoBeatsApiError("Rate limited", 429, null);
    gateway.findTracksBySpotifyIds.mockRejectedValueOnce(error);
    await expect(service.getTrackAudioFeaturesBySpotifyId("one")).rejects.toBe(
      error
    );

    await service.getTrackAudioFeaturesBySpotifyId("one");

    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledOnce();
  });

  it("keeps successful measurements after another read interrupts a strict preparation", async () => {
    const { service, gateway } = createService();
    const error = new ReccoBeatsApiError("Rate limited", 429, null);
    gateway.getTrackAudioFeatures
      .mockResolvedValueOnce({ tempo: 128 })
      .mockRejectedValueOnce(error);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["one", "two"], {
        errorMode: "strict",
      })
    ).rejects.toBe(error);
    const retried = await service.getManyTrackAudioFeaturesBySpotifyIds(
      ["one", "two"],
      { errorMode: "strict" }
    );

    expect(retried).toHaveLength(2);
    expect(gateway.findTracksBySpotifyIds).toHaveBeenLastCalledWith(["two"]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(3);
    expect(gateway.getTrackAudioFeatures.mock.calls).toEqual([
      ["recco-one"],
      ["recco-two"],
      ["recco-two"],
    ]);
  });

  it("does not let a cached success hide a technical error in strict mode", async () => {
    const { service, gateway } = createService();
    await service.getTrackAudioFeaturesBySpotifyId("one");
    const error = new ReccoBeatsApiError("Rate limited", 429, null);
    gateway.getTrackAudioFeatures.mockRejectedValueOnce(error);

    await expect(
      service.getManyTrackAudioFeaturesBySpotifyIds(["one", "two"], {
        errorMode: "strict",
      })
    ).rejects.toBe(error);

    expect(gateway.findTracksBySpotifyIds).toHaveBeenLastCalledWith(["two"]);
  });

  it("retains partial-mode results and does not cache the failed track", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, gateway } = createService();
    gateway.getTrackAudioFeatures
      .mockResolvedValueOnce({ tempo: 128 })
      .mockRejectedValueOnce(new ReccoBeatsApiError("Unavailable", 503, null));

    const partial = await service.getManyTrackAudioFeaturesBySpotifyIds([
      "one",
      "two",
    ]);
    expect(partial[1]).toEqual({ spotifyId: "two", error: "Unavailable" });

    await service.getManyTrackAudioFeaturesBySpotifyIds(["one", "two"]);

    expect(gateway.findTracksBySpotifyIds).toHaveBeenLastCalledWith(["two"]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(3);
  });
});

function createService() {
  const gateway = {
    findTracksBySpotifyIds: vi
      .fn<ReccoBeatsGateway["findTracksBySpotifyIds"]>()
      .mockImplementation(async (ids) =>
        ids.map((id) => ({
          id: `recco-${id}`,
          href: `https://open.spotify.com/track/${id}`,
        }))
      ),
    getTrackAudioFeatures: vi
      .fn<ReccoBeatsGateway["getTrackAudioFeatures"]>()
      .mockResolvedValue({ tempo: 128, energy: 0.8 }),
  };
  return {
    gateway,
    service: createReccoBeatsService({ reccoBeatsGateway: gateway }),
  };
}
