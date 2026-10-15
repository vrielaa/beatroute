import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";
import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { createPlaylistDatasetService } from "./playlist-dataset.service.js";
import type {
  PlaylistDatasetDependencies,
  PlaylistTrackIdsFile,
} from "./types.js";

const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const accessToken = "access-token";
const cacheScope = "session-context";
const dayMs = 24 * 60 * 60 * 1_000;

describe("playlist dataset metadata cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses metadata but retrieves audio measurements for each preparation", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    await service.prepareDataset(file, accessToken, cacheScope);
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValueOnce([
      { ...createAudioFeatures(firstId), tempo: 140 },
    ]);
    const result = await service.prepareDataset(file, accessToken, cacheScope);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledTimes(2);
    expect(result.dataset.tracks[0].audioFeatures.tempo).toBe(140);
  });

  it("preserves successful reads after a later track causes a rate-limit error", async () => {
    const dependencies = createDependencies();
    const error = new IntegrationApiError("spotify", "Rate limit", {
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 300,
    });
    dependencies.getSpotifyTrackById
      .mockResolvedValueOnce({
        name: "First song",
        artists: [{ name: "Artist" }],
      })
      .mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId, secondId]);

    await expect(
      service.prepareDataset(file, accessToken, cacheScope)
    ).rejects.toBe(error);
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();

    const result = await service.prepareDataset(file, accessToken, cacheScope);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(3);
    expect(dependencies.getSpotifyTrackById).toHaveBeenNthCalledWith(
      3,
      secondId,
      accessToken
    );
    expect(result.dataset.tracks.map((track) => track.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(result.dataset.tracks[0].name).toBe("First song");
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledOnce();
  });

  it("preserves metadata when the audio provider fails", async () => {
    const dependencies = createDependencies();
    const error = new IntegrationApiError("reccobeats", "Unavailable", {
      category: "unavailable",
      upstreamStatus: 503,
    });
    dependencies.getAudioFeaturesBySpotifyIds.mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    await expect(
      service.prepareDataset(file, accessToken, cacheScope)
    ).rejects.toBe(error);
    const result = await service.prepareDataset(file, accessToken, cacheScope);

    expect(result.dataset.tracks).toHaveLength(1);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledTimes(2);
  });

  it("uses cached metadata until exactly 24 hours after retrieval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    await service.prepareDataset(file, accessToken, cacheScope);
    await vi.advanceTimersByTimeAsync(dayMs - 1);
    await service.prepareDataset(file, accessToken, cacheScope);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();

    dependencies.getSpotifyTrackById.mockResolvedValueOnce({
      name: "Updated song",
      artists: [{ name: "Updated artist" }],
    });
    await vi.advanceTimersByTimeAsync(1);
    const result = await service.prepareDataset(file, accessToken, cacheScope);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    expect(result.dataset.tracks[0].name).toBe("Updated song");
    expect(result.dataset.tracks[0].artists).toEqual(["Updated artist"]);
  });

  it("retains metadata but restarts all audio chunks after a later chunk fails", async () => {
    const dependencies = createDependencies();
    const ids = Array.from({ length: 81 }, (_, index) =>
      index.toString(36).padStart(22, "0")
    );
    const error = new IntegrationApiError("reccobeats", "Rate limit", {
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 30,
    });
    dependencies.getAudioFeaturesBySpotifyIds
      .mockImplementationOnce(async (requestedIds) =>
        requestedIds.map(createAudioFeatures)
      )
      .mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile(ids);

    await expect(
      service.prepareDataset(file, accessToken, cacheScope)
    ).rejects.toBe(error);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(81);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds.mock.calls.map(
        ([requestedIds]) => requestedIds
      )
    ).toEqual([ids.slice(0, 40), ids.slice(40, 80)]);

    const result = await service.prepareDataset(
      file,
      "renewed-token",
      cacheScope
    );

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(81);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds.mock.calls
        .slice(2)
        .map(([requestedIds]) => requestedIds)
    ).toEqual([ids.slice(0, 40), ids.slice(40, 80), ids.slice(80)]);
    expect(result.dataset.tracks.map((track) => track.id)).toEqual(ids);
    expect(result.skippedTracks).toEqual([]);
    expect(result.incompleteTracks).toEqual([]);
  });

  it("keeps metadata isolated between session contexts", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById
      .mockResolvedValueOnce({
        name: "First user's song",
        artists: [{ name: "First artist" }],
      })
      .mockResolvedValueOnce({
        name: "Second user's song",
        artists: [{ name: "Second artist" }],
      });
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    const firstResult = await service.prepareDataset(
      file,
      "first-token",
      "first-session"
    );
    const secondResult = await service.prepareDataset(
      file,
      "second-token",
      "second-session"
    );
    const cachedFirstResult = await service.prepareDataset(
      file,
      "first-token",
      "first-session"
    );

    expect(firstResult.dataset.tracks[0].name).toBe("First user's song");
    expect(secondResult.dataset.tracks[0].name).toBe("Second user's song");
    expect(cachedFirstResult.dataset.tracks[0].name).toBe("First user's song");
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(cachedFirstResult)).not.toContain("first-session");
    expect(JSON.stringify(cachedFirstResult)).not.toContain("first-token");
  });

  it("reuses the same session's metadata after token renewal and uses the new token for misses", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);

    await service.prepareDataset(
      createFile([firstId]),
      "old-token",
      cacheScope
    );
    const result = await service.prepareDataset(
      createFile([firstId, secondId]),
      "new-token",
      cacheScope
    );

    expect(result.dataset.tracks).toHaveLength(2);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    expect(dependencies.getSpotifyTrackById).toHaveBeenLastCalledWith(
      secondId,
      "new-token"
    );
  });

  it("preserves the new file's ordering and does not include unrelated cached tracks", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);

    await service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken,
      cacheScope
    );
    const reordered = await service.prepareDataset(
      createFile([secondId, firstId]),
      accessToken,
      cacheScope
    );
    const subset = await service.prepareDataset(
      createFile([secondId]),
      accessToken,
      cacheScope
    );

    expect(reordered.dataset.tracks.map((track) => track.id)).toEqual([
      secondId,
      firstId,
    ]);
    expect(subset.dataset.tracks.map((track) => track.id)).toEqual([secondId]);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenLastCalledWith([
      secondId,
    ]);
  });

  it("protects cached metadata from changes to returned datasets", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);
    const firstResult = await service.prepareDataset(
      file,
      accessToken,
      cacheScope
    );

    firstResult.dataset.tracks[0].name = "Changed name";
    firstResult.dataset.tracks[0].artists[0] = "Changed artist";
    const secondResult = await service.prepareDataset(
      file,
      accessToken,
      cacheScope
    );
    secondResult.dataset.tracks[0].artists.push("Another changed artist");
    const thirdResult = await service.prepareDataset(
      file,
      accessToken,
      cacheScope
    );

    expect(thirdResult.dataset.tracks[0].name).toBe(`Song ${firstId}`);
    expect(thirdResult.dataset.tracks[0].artists).toEqual(["Artist"]);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
  });

  it("retains only normalized names and does not expose additional source fields", async () => {
    const dependencies = createDependencies();
    const source = {
      name: "  Song  ",
      artists: [{ name: " Artist " }, { name: " " }],
      accessToken: "private-source-token",
      extraData: "private-extra-data",
    };
    dependencies.getSpotifyTrackById.mockResolvedValue(source);
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    await service.prepareDataset(file, accessToken, cacheScope);
    source.name = "Changed source";
    source.artists[0].name = "Changed source artist";
    const result = await service.prepareDataset(file, accessToken, cacheScope);

    expect(result.dataset.tracks[0].name).toBe("Song");
    expect(result.dataset.tracks[0].artists).toEqual(["Artist"]);
    expect(JSON.stringify(result)).not.toContain("private-source-token");
    expect(JSON.stringify(result)).not.toContain("private-extra-data");
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
  });

  it("does not cache missing tracks", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockRejectedValueOnce(
      new IntegrationApiError("spotify", "Not found", {
        upstreamStatus: 404,
      })
    );
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    const missing = await service.prepareDataset(file, accessToken, cacheScope);
    const available = await service.prepareDataset(
      file,
      accessToken,
      cacheScope
    );

    expect(missing.dataset.tracks).toEqual([]);
    expect(available.dataset.tracks).toHaveLength(1);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: " ", artists: [{ name: "Artist" }] },
    { name: "Song", artists: [] },
  ])("does not cache unusable metadata: %j", async (source) => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockResolvedValueOnce(source);
    const service = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    const missing = await service.prepareDataset(file, accessToken, cacheScope);
    const available = await service.prepareDataset(
      file,
      accessToken,
      cacheScope
    );

    expect(missing.dataset.tracks).toEqual([]);
    expect(available.dataset.tracks).toHaveLength(1);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, ""])(
    "does not cache without a nonempty session context: %s",
    async (scope) => {
      const dependencies = createDependencies();
      const service = createPlaylistDatasetService(dependencies);
      const file = createFile([firstId]);

      await service.prepareDataset(file, accessToken, scope);
      await service.prepareDataset(file, accessToken, scope);

      expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    }
  );

  it("does not share cache entries between service instances", async () => {
    const dependencies = createDependencies();
    const firstService = createPlaylistDatasetService(dependencies);
    const secondService = createPlaylistDatasetService(dependencies);
    const file = createFile([firstId]);

    await firstService.prepareDataset(file, accessToken, cacheScope);
    await secondService.prepareDataset(file, accessToken, cacheScope);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry when all session caches exceed 1000 entries", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);
    const ids = Array.from({ length: 500 }, (_, index) =>
      index.toString(36).padStart(22, "0")
    );
    const file = createFile(ids);

    await service.prepareDataset(file, accessToken, "first-session");
    await service.prepareDataset(file, accessToken, "second-session");
    await service.prepareDataset(
      createFile([ids[0]]),
      accessToken,
      "third-session"
    );
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(1_001);

    await service.prepareDataset(
      createFile([ids[1]]),
      accessToken,
      "first-session"
    );
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(1_001);

    await service.prepareDataset(
      createFile([ids[0]]),
      accessToken,
      "first-session"
    );
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(1_002);

    await service.prepareDataset(
      createFile([ids[0]]),
      accessToken,
      "second-session"
    );
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(1_002);
  });
});

function createFile(spotifyTrackIds: string[]): PlaylistTrackIdsFile {
  return { version: 1, spotifyTrackIds };
}

function createDependencies() {
  return {
    getCurrentUserSavedTracks:
      vi.fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>(),
    getSpotifyTrackById: vi
      .fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>()
      .mockImplementation(async (spotifyId) => ({
        name: `Song ${spotifyId}`,
        artists: [{ name: "Artist" }],
      })),
    getAudioFeaturesBySpotifyIds: vi
      .fn<PlaylistDatasetDependencies["getAudioFeaturesBySpotifyIds"]>()
      .mockImplementation(async (ids) => ids.map(createAudioFeatures)),
  };
}

function createAudioFeatures(spotifyId: string): TrackAudioFeatures {
  return {
    id: `source-${spotifyId}`,
    spotifyId,
    tempo: 125,
    energy: 0.8,
    danceability: 0.7,
    valence: 0.65,
    acousticness: 0.2,
    instrumentalness: 0.1,
    speechiness: 0.05,
    liveness: 0.15,
    key: 2,
    mode: 1,
    loudness: -5,
    timeSignature: 4,
  };
}
