import { describe, expect, it, vi } from "vitest";
import { createPlaylistSaveService } from "./playlist-save.service.js";
import { PartialPlaylistSaveError } from "./partial-playlist-save.error.js";
import type { PlaylistSaveDependencies, PlaylistToSave } from "./types.js";

const accessToken = "spotify-access-token";

describe("playlist saving", () => {
  it("creates one playlist and saves a single track without modifying input", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistSaveService(dependencies);
    const playlist: PlaylistToSave = {
      name: "Na siłownię",
      trackIds: ["3sNVsP50132BTNlImLx70i"],
    };
    const original = structuredClone(playlist);
    Object.freeze(playlist.trackIds);
    Object.freeze(playlist);

    const result = await service.savePlaylist(playlist, accessToken);

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.createPlaylist).toHaveBeenCalledWith(
      accessToken,
      playlist.name
    );
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledWith(
      accessToken,
      "new-playlist-id",
      playlist.trackIds
    );
    expect(result).toEqual({
      id: "new-playlist-id",
      name: "Nazwa zwrócona przez Spotify",
      spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
      trackCount: 1,
    });
    expect(playlist).toEqual(original);
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });

  it("saves 101 tracks in two ordered batches using the same playlist", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistSaveService(dependencies);
    const trackIds = Array.from({ length: 101 }, (_, index) =>
      (100 - index).toString(36).padStart(22, "0")
    );
    const playlist: PlaylistToSave = {
      name: "Na siłownię",
      trackIds,
    };
    const original = structuredClone(playlist);

    const result = await service.savePlaylist(playlist, accessToken);

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.createPlaylist).toHaveBeenCalledWith(
      accessToken,
      playlist.name
    );
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
      1,
      accessToken,
      "new-playlist-id",
      trackIds.slice(0, 100)
    );
    expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
      2,
      accessToken,
      "new-playlist-id",
      trackIds.slice(100)
    );
    expect(result).toEqual({
      id: "new-playlist-id",
      name: "Nazwa zwrócona przez Spotify",
      spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
      trackCount: 101,
    });
    expect(playlist).toEqual(original);
  });

  it.each([
    { trackCount: 100, batchSizes: [100] },
    { trackCount: 200, batchSizes: [100, 100] },
    { trackCount: 500, batchSizes: [100, 100, 100, 100, 100] },
  ])(
    "saves exactly $trackCount tracks without an empty trailing batch",
    async ({ trackCount, batchSizes }) => {
      const dependencies = createDependencies();
      const service = createPlaylistSaveService(dependencies);
      const playlist = createPlaylistToSave(trackCount);
      const original = structuredClone(playlist);
      Object.freeze(playlist.trackIds);
      Object.freeze(playlist);

      const result = await service.savePlaylist(playlist, accessToken);

      expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
      expect(dependencies.createPlaylist).toHaveBeenCalledWith(
        accessToken,
        playlist.name
      );
      expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(
        batchSizes.length
      );

      const savedBatches = dependencies.addTracksToPlaylist.mock.calls.map(
        (call) => call[2]
      );

      expect(savedBatches.map((batch) => batch.length)).toEqual(batchSizes);
      expect(savedBatches.flat()).toEqual(original.trackIds);

      for (let index = 0; index < batchSizes.length; index += 1) {
        expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
          index + 1,
          accessToken,
          "new-playlist-id",
          original.trackIds.slice(index * 100, (index + 1) * 100)
        );
      }

      expect(result.trackCount).toBe(trackCount);
      expect(playlist).toEqual(original);
    }
  );

  it("waits for each batch and returns a result only after the last confirmation", async () => {
    const dependencies = createDependencies();
    const firstBatch = createDeferredPromise<void>();
    const secondBatch = createDeferredPromise<void>();
    const lastBatch = createDeferredPromise<void>();
    dependencies.addTracksToPlaylist
      .mockReturnValueOnce(firstBatch.promise)
      .mockReturnValueOnce(secondBatch.promise)
      .mockReturnValueOnce(lastBatch.promise);
    const service = createPlaylistSaveService(dependencies);
    const onSaved = vi.fn();

    const result = service
      .savePlaylist(createPlaylistToSave(201), accessToken)
      .then((savedPlaylist) => {
        onSaved();
        return savedPlaylist;
      });

    await flushPromises();

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();

    firstBatch.resolve();
    await flushPromises();

    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(onSaved).not.toHaveBeenCalled();

    secondBatch.resolve();
    await flushPromises();

    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(3);
    expect(onSaved).not.toHaveBeenCalled();

    lastBatch.resolve();

    await expect(result).resolves.toMatchObject({ trackCount: 201 });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(3);
  });

  it("does not add tracks or retry when playlist creation fails", async () => {
    const dependencies = createDependencies();
    const error = new Error("Playlist creation failed");
    dependencies.createPlaylist.mockRejectedValueOnce(error);
    const service = createPlaylistSaveService(dependencies);

    await expect(
      service.savePlaylist(createPlaylistToSave(201), accessToken)
    ).rejects.toBe(error);

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])(
    "stops without retrying after batch %i fails",
    async (failedBatch) => {
      const dependencies = createDependencies();
      const error = new Error("Adding tracks failed");

      for (let index = 1; index < failedBatch; index += 1) {
        dependencies.addTracksToPlaylist.mockResolvedValueOnce({
          snapshot_id: `snapshot-${index}`,
        });
      }

      dependencies.addTracksToPlaylist.mockRejectedValueOnce(error);
      const service = createPlaylistSaveService(dependencies);
      const playlist = createPlaylistToSave(500);

      const result = service.savePlaylist(playlist, accessToken);

      await expect(result).rejects.toBeInstanceOf(PartialPlaylistSaveError);
      await expect(result).rejects.toMatchObject({
        cause: error,
        progress: {
          id: "new-playlist-id",
          name: "Nazwa zwrócona przez Spotify",
          spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
          confirmedTrackCount: (failedBatch - 1) * 100,
          requestedTrackCount: 500,
        },
      });

      expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
      expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(
        failedBatch
      );

      for (let index = 0; index < failedBatch; index += 1) {
        expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
          index + 1,
          accessToken,
          "new-playlist-id",
          playlist.trackIds.slice(index * 100, (index + 1) * 100)
        );
      }
    }
  );

  it("does not start later batches after a pending write rejects", async () => {
    const dependencies = createDependencies();
    const pendingBatch = createDeferredPromise<void>();
    dependencies.addTracksToPlaylist.mockReturnValueOnce(pendingBatch.promise);
    const service = createPlaylistSaveService(dependencies);
    const error = new Error("Pending write failed");

    const result = service.savePlaylist(createPlaylistToSave(201), accessToken);
    const rejection = expect(result).rejects.toMatchObject({
      cause: error,
      progress: { confirmedTrackCount: 0, requestedTrackCount: 201 },
    });

    await flushPromises();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledOnce();

    pendingBatch.reject(error);
    await rejection;
    await flushPromises();

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledOnce();
  });

  it("does not recreate the playlist or retry a timed-out write", async () => {
    const dependencies = createDependencies();
    const timeoutError = new Error("Request timed out");
    timeoutError.name = "TimeoutError";
    dependencies.addTracksToPlaylist.mockRejectedValueOnce(timeoutError);
    const service = createPlaylistSaveService(dependencies);

    const result = service.savePlaylist(createPlaylistToSave(201), accessToken);

    await expect(result).rejects.toBeInstanceOf(PartialPlaylistSaveError);
    await expect(result).rejects.toMatchObject({
      cause: timeoutError,
      progress: { confirmedTrackCount: 0, requestedTrackCount: 201 },
    });

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledOnce();
  });

  it("keeps confirmed tracks when the final partial batch has an unknown outcome", async () => {
    const dependencies = createDependencies();
    const pendingBatch = createDeferredPromise<void>();
    dependencies.addTracksToPlaylist
      .mockResolvedValueOnce({ snapshot_id: "first-snapshot" })
      .mockReturnValueOnce(pendingBatch.promise);
    const service = createPlaylistSaveService(dependencies);
    const timeoutError = new Error("Response was not received");
    timeoutError.name = "TimeoutError";
    const playlist = createPlaylistToSave(150);
    const original = structuredClone(playlist);

    const result = service.savePlaylist(playlist, accessToken);
    const rejection = expect(result).rejects.toMatchObject({
      cause: timeoutError,
      progress: {
        id: "new-playlist-id",
        name: "Nazwa zwrócona przez Spotify",
        spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
        confirmedTrackCount: 100,
        requestedTrackCount: 150,
      },
    });

    await flushPromises();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);

    pendingBatch.reject(timeoutError);
    await rejection;

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(playlist).toEqual(original);
  });

  it("keeps progress separate for consecutive save operations", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistSaveService(dependencies);

    await expect(
      service.savePlaylist(createPlaylistToSave(101), accessToken)
    ).resolves.toMatchObject({ trackCount: 101 });

    const error = new Error("Next playlist write failed");
    dependencies.createPlaylist.mockResolvedValueOnce({
      id: "another-playlist-id",
      name: "Another playlist",
      external_urls: {
        spotify: "https://open.spotify.com/playlist/another-playlist-id",
      },
    });
    dependencies.addTracksToPlaylist.mockRejectedValueOnce(error);

    await expect(
      service.savePlaylist(createPlaylistToSave(201), accessToken)
    ).rejects.toMatchObject({
      cause: error,
      progress: {
        id: "another-playlist-id",
        name: "Another playlist",
        spotifyUrl: "https://open.spotify.com/playlist/another-playlist-id",
        confirmedTrackCount: 0,
        requestedTrackCount: 201,
      },
    });

    expect(dependencies.createPlaylist).toHaveBeenCalledTimes(2);
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(3);
  });

  it("captures the original selection before asynchronous writes begin", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistSaveService(dependencies);
    const playlist = createPlaylistToSave(101);
    const selectedTrackIds = [...playlist.trackIds];
    const error = new Error("Second batch failed");
    dependencies.addTracksToPlaylist
      .mockResolvedValueOnce({ snapshot_id: "first-snapshot" })
      .mockRejectedValueOnce(error);

    const result = service.savePlaylist(playlist, accessToken);
    playlist.trackIds.splice(0, playlist.trackIds.length, "A".repeat(22));

    await expect(result).rejects.toMatchObject({
      cause: error,
      progress: { confirmedTrackCount: 100, requestedTrackCount: 101 },
    });

    expect(dependencies.createPlaylist).toHaveBeenCalledOnce();
    expect(dependencies.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
      1,
      accessToken,
      "new-playlist-id",
      selectedTrackIds.slice(0, 100)
    );
    expect(dependencies.addTracksToPlaylist).toHaveBeenNthCalledWith(
      2,
      accessToken,
      "new-playlist-id",
      selectedTrackIds.slice(100)
    );
  });
});

/**
 * Ręcznie sterowany Promise używany do sprawdzania kolejności zapisu partii.
 *
 * @property promise - Operacja oczekująca na ręczne zakończenie.
 * @property resolve - Potwierdza zakończenie operacji przekazaną wartością.
 * @property reject - Odrzuca operację przekazanym błędem.
 */
type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

/** Tworzy dane testowej playlisty z unikalnymi ID w kolejności malejącej. */
function createPlaylistToSave(trackCount: number): PlaylistToSave {
  return {
    name: "Na siłownię",
    trackIds: Array.from({ length: trackCount }, (_, index) =>
      (trackCount - index - 1).toString(36).padStart(22, "0")
    ),
  };
}

/** Tworzy operację, której sukces lub błąd jest kontrolowany przez test. */
function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
    reject(reason) {
      rejectPromise?.(reason);
    },
  };
}

/** Pozwala kontynuować oczekujące await bez opóźnień i zegarów testowych. */
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDependencies() {
  return {
    createPlaylist: vi
      .fn<PlaylistSaveDependencies["createPlaylist"]>()
      .mockResolvedValue({
        id: "new-playlist-id",
        name: "Nazwa zwrócona przez Spotify",
        external_urls: {
          spotify: "https://open.spotify.com/playlist/new-playlist-id",
        },
      }),
    addTracksToPlaylist: vi
      .fn<PlaylistSaveDependencies["addTracksToPlaylist"]>()
      .mockResolvedValue({ snapshot_id: "updated-snapshot" }),
  };
}
