import { describe, expect, it, vi } from "vitest";
import { createPlaylistSaveService } from "./playlist-save.service.js";
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
});

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
