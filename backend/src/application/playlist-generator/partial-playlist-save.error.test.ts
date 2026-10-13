import { describe, expect, it } from "vitest";
import { PartialPlaylistSaveError } from "./partial-playlist-save.error.js";
import type { PlaylistSaveProgress } from "./types.js";

describe("PartialPlaylistSaveError", () => {
  it("keeps playlist progress and the original cause", () => {
    const progress = createProgress();
    const cause = new Error("Adding tracks failed");

    const error = new PartialPlaylistSaveError(progress, cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PartialPlaylistSaveError");
    expect(error.message).toContain("Sprawdź utworzoną playlistę");
    expect(error.progress).toEqual(progress);
    expect(error.cause).toBe(cause);
  });

  it("does not expose sensitive cause data or extra progress fields when serialized", () => {
    const progress = {
      ...createProgress(),
      accessToken: "sensitive-access-token",
      trackIds: ["private-track-id"],
    };
    const cause = {
      accessToken: "sensitive-access-token",
      clientSecret: "sensitive-client-secret",
    };

    const error = new PartialPlaylistSaveError(progress, cause);

    expect(error.progress).toEqual(createProgress());
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("sensitive");
    expect(JSON.stringify(error)).not.toContain("sensitive-access-token");
    expect(JSON.stringify(error)).not.toContain("sensitive-client-secret");
    expect(JSON.stringify(error)).not.toContain("private-track-id");
    expect(Object.keys(error)).not.toContain("cause");
  });

  it("captures progress without retaining the caller's mutable object", () => {
    const progress = createProgress();
    const error = new PartialPlaylistSaveError(progress, new Error("Failed"));

    progress.confirmedTrackCount = 250;
    progress.name = "Changed name";

    expect(error.progress).not.toBe(progress);
    expect(error.progress).toEqual(createProgress());
  });

  it.each([undefined, null, "failure", { reason: "failure" }])(
    "preserves an unknown cause without converting it: %j",
    (cause) => {
      const error = new PartialPlaylistSaveError(createProgress(), cause);

      expect(error.cause).toBe(cause);
      expect(error.progress.confirmedTrackCount).toBe(100);
    }
  );
});

function createProgress(): PlaylistSaveProgress {
  return {
    id: "playlist-id",
    name: "Na siłownię",
    spotifyUrl: "https://open.spotify.com/playlist/playlist-id",
    confirmedTrackCount: 100,
    requestedTrackCount: 250,
  };
}
