import { describe, expect, it, vi } from "vitest";
import { createPlaylistSaveService } from "./playlist-save.service.js";
import { PartialPlaylistSaveError } from "./partial-playlist-save.error.js";
import type { PendingPlaylistSave, PlaylistSaveDependencies } from "./types.js";

describe("playlist save resumption", () => {
  it("adds only the last 32 of 132 tracks without creating another playlist", async () => {
    const pending = createPending(132, 100);
    const original = structuredClone(pending);
    const dependencies = createDependencies(pending.trackIds.slice(0, 100));
    const service = createPlaylistSaveService(dependencies);

    const result = await service.resumePlaylist(pending, "token");

    expect(dependencies.getPlaylistContents).toHaveBeenCalledExactlyOnceWith(
      "token",
      pending.progress.id
    );
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledExactlyOnceWith(
      "token",
      pending.progress.id,
      pending.trackIds.slice(100)
    );
    expect(dependencies.createPlaylist).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: pending.progress.id,
      name: "Playlist",
      spotifyUrl: pending.progress.spotifyUrl,
      trackCount: 132,
    });
    expect(pending).toEqual(original);
  });

  it("does not resend an already written but unconfirmed last batch", async () => {
    const pending = createPending(132, 100);
    const dependencies = createDependencies(pending.trackIds);

    await expect(
      createPlaylistSaveService(dependencies).resumePlaylist(pending, "token")
    ).resolves.toMatchObject({ id: pending.progress.id, trackCount: 132 });

    expect(dependencies.addTracksToPlaylist).not.toHaveBeenCalled();
    expect(dependencies.createPlaylist).not.toHaveBeenCalled();
  });

  it("accepts a full first batch whose response was lost and writes the remaining suffix", async () => {
    const pending = createPending(250, 0);
    const dependencies = createDependencies(pending.trackIds.slice(0, 100));

    await createPlaylistSaveService(dependencies).resumePlaylist(
      pending,
      "token"
    );

    expect(
      dependencies.addTracksToPlaylist.mock.calls.map((call) => call[2])
    ).toEqual([pending.trackIds.slice(100, 200), pending.trackIds.slice(200)]);
  });

  it("supports an empty playlist when no previous batch was confirmed", async () => {
    const pending = createPending(101, 0);
    const dependencies = createDependencies([]);

    await createPlaylistSaveService(dependencies).resumePlaylist(
      pending,
      "token"
    );

    expect(
      dependencies.addTracksToPlaylist.mock.calls.map((call) => call[2].length)
    ).toEqual([100, 1]);
  });

  it.each([
    { description: "removed confirmed track", actual: [] },
    { description: "different first track", actual: ["x".repeat(22)] },
    {
      description: "reversed order",
      actual: ["1".padStart(22, "0"), "0".padStart(22, "0")],
    },
    {
      description: "duplicate",
      actual: ["0".padStart(22, "0"), "0".padStart(22, "0")],
    },
    { description: "missing item", actual: [null] },
    {
      description: "extra item",
      actual: [
        "0".padStart(22, "0"),
        "1".padStart(22, "0"),
        "2".padStart(22, "0"),
      ],
    },
  ])("stops on $description without writing", async ({ actual }) => {
    const pending = createPending(2, 1);
    const dependencies = createDependencies(actual);

    await expect(
      createPlaylistSaveService(dependencies).resumePlaylist(pending, "token")
    ).rejects.toMatchObject({ code: "PLAYLIST_CONTENTS_CHANGED" });

    expect(dependencies.addTracksToPlaylist).not.toHaveBeenCalled();
    expect(dependencies.createPlaylist).not.toHaveBeenCalled();
  });

  it("propagates a read failure, retaining the original progress and releasing the lock", async () => {
    const pending = createPending(2, 1);
    const dependencies = createDependencies(pending.trackIds.slice(0, 1));
    const error = new Error("Cannot read playlist");
    dependencies.getPlaylistContents.mockRejectedValueOnce(error);
    const service = createPlaylistSaveService(dependencies);

    await expect(service.resumePlaylist(pending, "token")).rejects.toBe(error);
    expect(dependencies.addTracksToPlaylist).not.toHaveBeenCalled();
    expect(pending.progress.confirmedTrackCount).toBe(1);

    await expect(
      service.resumePlaylist(pending, "token")
    ).resolves.toMatchObject({ trackCount: 2 });
  });

  it("updates partial progress using both the actual contents and newly confirmed batches", async () => {
    const pending = createPending(350, 100);
    const dependencies = createDependencies(pending.trackIds.slice(0, 200));
    dependencies.addTracksToPlaylist
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("write failed"));

    const request = createPlaylistSaveService(dependencies).resumePlaylist(
      pending,
      "token"
    );

    await expect(request).rejects.toBeInstanceOf(PartialPlaylistSaveError);
    await expect(request).rejects.toMatchObject({
      progress: {
        id: pending.progress.id,
        confirmedTrackCount: 300,
        requestedTrackCount: 350,
      },
    });
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(pending.progress.confirmedTrackCount).toBe(100);
  });

  it("rejects a concurrent resumption and releases the lock after finishing", async () => {
    const pending = createPending(2, 1);
    const dependencies = createDependencies(pending.trackIds.slice(0, 1));
    let finishRead!: (value: {
      trackIds: string[];
      snapshotId: string;
    }) => void;
    dependencies.getPlaylistContents.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      })
    );
    const service = createPlaylistSaveService(dependencies);
    const first = service.resumePlaylist(pending, "token");

    await expect(
      service.resumePlaylist(pending, "token")
    ).rejects.toMatchObject({ code: "PLAYLIST_SAVE_IN_PROGRESS" });
    expect(dependencies.getPlaylistContents).toHaveBeenCalledOnce();
    finishRead({ trackIds: pending.trackIds, snapshotId: "snapshot" });
    await expect(first).resolves.toMatchObject({ trackCount: 2 });
    dependencies.getPlaylistContents.mockResolvedValue({
      trackIds: pending.trackIds,
      snapshotId: "snapshot",
    });
    await expect(
      service.resumePlaylist(pending, "token")
    ).resolves.toMatchObject({ trackCount: 2 });
    expect(dependencies.addTracksToPlaylist).not.toHaveBeenCalled();
  });
});

function createPending(
  count: number,
  confirmedTrackCount: number
): PendingPlaylistSave {
  const id = "p".repeat(22);
  return {
    progress: {
      id,
      name: "Playlist",
      spotifyUrl: `https://open.spotify.com/playlist/${id}`,
      confirmedTrackCount,
      requestedTrackCount: count,
    },
    trackIds: Array.from({ length: count }, (_, index) =>
      String(index).padStart(22, "0")
    ),
  };
}

function createDependencies(trackIds: (string | null)[]) {
  return {
    createPlaylist: vi.fn<PlaylistSaveDependencies["createPlaylist"]>(),
    addTracksToPlaylist: vi
      .fn<PlaylistSaveDependencies["addTracksToPlaylist"]>()
      .mockResolvedValue(undefined),
    getPlaylistContents: vi
      .fn<PlaylistSaveDependencies["getPlaylistContents"]>()
      .mockResolvedValue({ trackIds, snapshotId: "snapshot" }),
  };
}
