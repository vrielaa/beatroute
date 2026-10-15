import { describe, expect, it, vi } from "vitest";
import {
  createPlaylistDatasetService,
  PlaylistSourceChangedError,
} from "./playlist-dataset.service.js";
import type { PlaylistDatasetDependencies } from "./types.js";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";

const playlistId = "P".repeat(22);
const trackId = "A".repeat(22);
const metadata = { id: playlistId, name: "Summer", snapshotId: "version-1" };
const track = { id: trackId, name: " Song ", artists: [{ name: " Artist " }] };
const selection = { playlistId, offset: 0, snapshotId: null };

describe("playlist dataset preparation", () => {
  it("uses playlist metadata directly and verifies its version before requesting audio", async () => {
    const deps = dependencies();
    const service = createPlaylistDatasetService(deps);
    const result = await service.preparePlaylistPage(selection, "token");
    expect(deps.getPlaylistItemsPage).toHaveBeenCalledExactlyOnceWith(
      "token",
      playlistId,
      { limit: 50, offset: 0 }
    );
    expect(deps.getPlaylistMetadata).toHaveBeenCalledTimes(2);
    expect(deps.getSpotifyTrackById).not.toHaveBeenCalled();
    expect(deps.getCurrentUserSavedTracks).not.toHaveBeenCalled();
    expect(deps.getAudioFeaturesBySpotifyIds).toHaveBeenCalledExactlyOnceWith([
      trackId,
    ]);
    expect(
      deps.getPlaylistMetadata.mock.invocationCallOrder.at(-1)
    ).toBeLessThan(
      deps.getAudioFeaturesBySpotifyIds.mock.invocationCallOrder[0]!
    );
    expect(result).toMatchObject({
      playlist: metadata,
      pagination: {
        offset: 0,
        processedItems: 1,
        totalItems: 1,
        nextOffset: null,
      },
      unavailableItemsCount: 0,
    });
    expect(result.preparedDataset.dataset.tracks[0]).toMatchObject({
      id: trackId,
      name: "Song",
      artists: ["Artist"],
      audioFeatures: { energy: 0, tempo: 128 },
    });
    expect(
      result.preparedDataset.incompleteTracks[0]?.missingFeatures
    ).toContain("valence");
  });

  it("counts source positions while skipping unavailable items and deduplicating IDs", async () => {
    const deps = dependencies();
    deps.getPlaylistItemsPage.mockResolvedValue({
      items: [
        null,
        track,
        track,
        { ...track, id: "bad" },
        { ...track, id: "B".repeat(22), is_playable: false },
      ],
      offset: 0,
      total: 120,
    });
    const result = await createPlaylistDatasetService(deps).preparePlaylistPage(
      selection,
      "token"
    );
    expect(result.pagination).toEqual({
      offset: 0,
      processedItems: 5,
      totalItems: 120,
      nextOffset: 5,
    });
    expect(result.unavailableItemsCount).toBe(3);
    expect(result.preparedDataset.dataset.tracks).toHaveLength(1);
  });

  it.each([
    { offset: 450, count: 50 },
    { offset: 499, count: 1 },
  ])("stops at the 500-position limit: %j", async ({ offset, count }) => {
    const deps = dependencies();
    deps.getPlaylistItemsPage.mockResolvedValue({
      items: Array.from({ length: count }, () => null),
      offset,
      total: 900,
    });
    const result = await createPlaylistDatasetService(deps).preparePlaylistPage(
      { playlistId, offset, snapshotId: "version-1" },
      "token"
    );
    expect(deps.getPlaylistItemsPage).toHaveBeenCalledExactlyOnceWith(
      "token",
      playlistId,
      { limit: count, offset }
    );
    expect(result.pagination.nextOffset).toBeNull();
    expect(result.pagination.processedItems).toBe(count);
    expect(deps.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("accepts an empty playlist without requesting measurements", async () => {
    const deps = dependencies();
    deps.getPlaylistItemsPage.mockResolvedValue({
      items: [],
      offset: 0,
      total: 0,
    });
    const result = await createPlaylistDatasetService(deps).preparePlaylistPage(
      selection,
      "token"
    );
    expect(result.preparedDataset.dataset.tracks).toEqual([]);
    expect(result.pagination).toEqual({
      offset: 0,
      processedItems: 0,
      totalItems: 0,
      nextOffset: null,
    });
    expect(deps.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("rejects a changed version before reading another page", async () => {
    const deps = dependencies();
    await expect(
      createPlaylistDatasetService(deps).preparePlaylistPage(
        { playlistId, offset: 50, snapshotId: "old-version" },
        "token"
      )
    ).rejects.toBeInstanceOf(PlaylistSourceChangedError);
    expect(deps.getPlaylistItemsPage).not.toHaveBeenCalled();
    expect(deps.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("rejects a version change during the page read before requesting measurements", async () => {
    const deps = dependencies();
    deps.getPlaylistMetadata
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce({ ...metadata, snapshotId: "new" });
    await expect(
      createPlaylistDatasetService(deps).preparePlaylistPage(selection, "token")
    ).rejects.toBeInstanceOf(PlaylistSourceChangedError);
    expect(deps.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it.each([-1, 500, 1.5, NaN, Infinity])(
    "rejects offset %s without contacting providers",
    async (offset) => {
      const deps = dependencies();
      await expect(
        createPlaylistDatasetService(deps).preparePlaylistPage(
          { ...selection, offset },
          "token"
        )
      ).rejects.toBeInstanceOf(RangeError);
      expect(deps.getPlaylistMetadata).not.toHaveBeenCalled();
    }
  );

  it("propagates provider errors instead of returning an empty dataset", async () => {
    const deps = dependencies();
    const error = new Error("Unavailable");
    deps.getAudioFeaturesBySpotifyIds.mockRejectedValue(error);
    await expect(
      createPlaylistDatasetService(deps).preparePlaylistPage(selection, "token")
    ).rejects.toBe(error);
  });
});

function dependencies() {
  return {
    getSpotifyTrackById:
      vi.fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>(),
    getCurrentUserSavedTracks:
      vi.fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>(),
    getPlaylistMetadata: vi
      .fn<PlaylistDatasetDependencies["getPlaylistMetadata"]>()
      .mockResolvedValue(metadata),
    getPlaylistItemsPage: vi
      .fn<PlaylistDatasetDependencies["getPlaylistItemsPage"]>()
      .mockResolvedValue({ items: [track], offset: 0, total: 1 }),
    getAudioFeaturesBySpotifyIds: vi
      .fn<PlaylistDatasetDependencies["getAudioFeaturesBySpotifyIds"]>()
      .mockImplementation(async (ids) =>
        ids.map((spotifyId): TrackAudioFeatures => ({
          id: spotifyId,
          spotifyId,
          tempo: 128,
          energy: 0,
          danceability: null,
          valence: null,
          acousticness: null,
          instrumentalness: null,
          speechiness: null,
          liveness: null,
          key: null,
          mode: null,
          loudness: null,
          timeSignature: null,
        }))
      ),
  };
}
