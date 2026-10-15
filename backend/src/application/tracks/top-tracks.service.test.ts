import { describe, expect, it, vi } from "vitest";
import { createTopTracksService } from "./top-tracks.service.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { mapReccoBeatsAudioFeatures } from "@integrations/reccobeats/reccobeats.mapper.js";
import type { SpotifyTrackApiResponse } from "@integrations/spotify/spotify.types.js";

describe("top tracks preparation", () => {
  it("keeps source order, reads metadata only once and advances by source positions", async () => {
    const { service, spotifyGateway, audioFeaturesReader } = setup([
      track(1),
      track(2),
      track(3),
    ]);
    audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [
        audio(3, { energy: 0 }),
        { spotifyId: id(2), error: "Not found" },
        audio(1, { tempo: 120 }),
      ]
    );
    const selection = {
      limit: 3,
      offset: 10,
      timeRange: "short_term",
      purpose: "statistics",
    } as const;
    const result = await service.getTopTracksBatch("token", selection);
    expect(result.tracks.map((item) => item.id)).toEqual([id(1), id(3)]);
    expect(result).toMatchObject({
      processedItems: 3,
      skippedItems: 1,
      totalItems: 20,
      nextOffset: 13,
    });
    expect(
      spotifyGateway.getCurrentUserTopTracks
    ).toHaveBeenCalledExactlyOnceWith("token", selection);
    expect(
      audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([id(1), id(2), id(3)], {
      errorMode: "strict",
    });
  });

  it("skips unusable metadata and deduplicates before reading audio", async () => {
    const { service, audioFeaturesReader } = setup([
      track(1),
      track(1),
      { ...track(2), is_local: true },
      { ...track(3), is_playable: false },
      { ...track(4), id: "bad-id" },
      { ...track(5), name: " " },
      { ...track(6), artists: [] },
      { ...track(7), artists: [{ name: " " }] },
    ]);
    audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [audio(1, { energy: 0 })]
    );
    const result = await service.getTopTracksBatch("token", {
      limit: 8,
      timeRange: "long_term",
      purpose: "statistics",
    });
    expect(result.tracks).toHaveLength(1);
    expect(result.skippedItems).toBe(7);
    expect(
      audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledWith([id(1)], { errorMode: "strict" });
  });

  it("counts partial measurements for statistics but requires all eleven map features", async () => {
    const { service, audioFeaturesReader } = setup([
      track(1),
      track(2),
      track(3),
    ]);
    audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [
        audio(1, { energy: 0 }),
        audio(2),
        audio(3, {
          acousticness: 0,
          danceability: 0,
          energy: 0,
          instrumentalness: 0,
          key: 0,
          liveness: 0,
          loudness: -5,
          mode: 0,
          speechiness: 0,
          tempo: 120,
          valence: 0,
        }),
      ]
    );
    const stats = await service.getTopTracksBatch("token", {
      limit: 3,
      timeRange: "long_term",
      purpose: "statistics",
    });
    const map = await service.getTopTracksBatch("token", {
      limit: 3,
      timeRange: "long_term",
      purpose: "music-map",
    });
    expect(stats.tracks.map((item) => item.id)).toEqual([id(1), id(3)]);
    expect(map.tracks.map((item) => item.id)).toEqual([id(3)]);
    expect(map.skippedItems).toBe(2);
  });

  it("does not treat an unknown key as a usable measurement", async () => {
    const { service, audioFeaturesReader } = setup([track(1)]);
    audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [audio(1, { key: -1 })]
    );
    expect(
      (
        await service.getTopTracksBatch("token", {
          limit: 1,
          timeRange: "long_term",
          purpose: "statistics",
        })
      ).tracks
    ).toEqual([]);
  });

  it("ends an empty source without calling ReccoBeats", async () => {
    const { service, spotifyGateway, audioFeaturesReader } = setup([]);
    spotifyGateway.getCurrentUserTopTracks.mockResolvedValue({
      items: [],
      offset: 0,
      total: 0,
      next: null,
    });
    expect(
      await service.getTopTracksBatch("token", {
        limit: 10,
        timeRange: "long_term",
        purpose: "statistics",
      })
    ).toMatchObject({
      tracks: [],
      processedItems: 0,
      skippedItems: 0,
      nextOffset: null,
    });
    expect(
      audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).not.toHaveBeenCalled();
  });

  it("preserves technical failures instead of counting them as skipped tracks", async () => {
    const { service, audioFeaturesReader } = setup([track(1)]);
    const error = new ReccoBeatsApiError("Rate limited", 429, null, {
      retryAfterSeconds: 120,
    });
    audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds.mockRejectedValue(
      error
    );
    await expect(
      service.getTopTracksBatch("token", {
        limit: 1,
        timeRange: "long_term",
        purpose: "statistics",
      })
    ).rejects.toBe(error);
  });
});

function setup(items: SpotifyTrackApiResponse[]) {
  const spotifyGateway = {
    getCurrentUserTopTracks: vi
      .fn()
      .mockResolvedValue({ items, offset: 10, total: 20, next: "next-page" }),
  };
  const audioFeaturesReader = {
    getManyTrackAudioFeaturesBySpotifyIds: vi.fn(),
  };
  return {
    spotifyGateway,
    audioFeaturesReader,
    service: createTopTracksService({ spotifyGateway, audioFeaturesReader }),
  };
}
function id(index: number) {
  return String(index).padStart(22, "0");
}
function track(index: number): SpotifyTrackApiResponse {
  return {
    id: id(index),
    name: `Track ${index}`,
    artists: [{ name: "Artist" }],
    album: { name: "Album", artists: [], images: [] },
    duration_ms: 1000,
    track_number: 1,
    external_urls: {},
  };
}
function audio(
  index: number,
  features: Parameters<typeof mapReccoBeatsAudioFeatures>[0] = {}
) {
  return {
    id: `recco-${index}`,
    spotifyId: id(index),
    ...mapReccoBeatsAudioFeatures(features),
  };
}
