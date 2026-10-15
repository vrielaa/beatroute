import { describe, expect, it, vi } from "vitest";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";
import { IntegrationApiError } from "@integrations/integration-api.error.js";
import type {
  SpotifyLibraryTrack,
  SpotifySavedTrackApiResponse,
  SpotifySavedTracksApiResponse,
} from "@integrations/spotify/spotify.types.js";
import { createPlaylistDatasetService } from "./playlist-dataset.service.js";
import type {
  PlaylistDatasetDependencies,
  PlaylistTrackIdsFile,
} from "./types.js";

const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const thirdId = "A".repeat(22);
const accessToken = "library-access-token";

describe("saved tracks dataset preparation", () => {
  it("uses library metadata directly and normalizes names without individual Spotify reads", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [
          createItem(firstId, {
            name: "  Saved song  ",
            artists: [{ name: " Artist " }, { name: " " }, { name: "Guest" }],
          }),
        ],
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      dependencies.getCurrentUserSavedTracks
    ).toHaveBeenCalledExactlyOnceWith(accessToken, { limit: 50, offset: 0 });
    expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([firstId]);
    expect(result).toEqual({
      preparedDataset: {
        dataset: {
          version: 1,
          tracks: [
            {
              id: firstId,
              name: "Saved song",
              artists: ["Artist", "Guest"],
              audioFeatures: {
                tempo: 125,
                energy: 0.8,
                danceability: 0.7,
                valence: 0.65,
                acousticness: 0.2,
                instrumentalness: 0.1,
                speechiness: 0.05,
                liveness: 0.15,
              },
            },
          ],
        },
        skippedTracks: [],
        incompleteTracks: [],
      },
      pagination: {
        offset: 0,
        processedItems: 1,
        totalItems: 1,
        nextOffset: null,
      },
      unavailableItemsCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });

  it.each([
    { offset: 0, count: 50, total: 132, limit: 50, nextOffset: 50 },
    { offset: 50, count: 50, total: 132, limit: 50, nextOffset: 100 },
    { offset: 100, count: 32, total: 132, limit: 50, nextOffset: null },
    { offset: 450, count: 50, total: 750, limit: 50, nextOffset: null },
    { offset: 499, count: 1, total: 750, limit: 1, nextOffset: null },
  ])(
    "prepares one page within the first 500 positions: %j",
    async ({ offset, count, total, limit, nextOffset }) => {
      const dependencies = createDependencies();
      const ids = createIds(count);
      dependencies.getCurrentUserSavedTracks.mockResolvedValue(
        createPage({
          items: ids.map((id) => createItem(id)),
          offset,
          total,
          limit,
        })
      );
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareSavedTracksPage(offset, accessToken);

      expect(
        dependencies.getCurrentUserSavedTracks
      ).toHaveBeenCalledExactlyOnceWith(accessToken, { limit, offset });
      expect(result.pagination).toEqual({
        offset,
        processedItems: count,
        totalItems: total,
        nextOffset,
      });
      expect(
        result.preparedDataset.dataset.tracks.map((track) => track.id)
      ).toEqual(ids);
      const requestedChunks =
        dependencies.getAudioFeaturesBySpotifyIds.mock.calls.map(
          ([requestedIds]) => requestedIds
        );
      expect(requestedChunks.flat()).toEqual(ids);
      expect(
        requestedChunks.every((chunk) => chunk.length > 0 && chunk.length <= 40)
      ).toBe(true);
      expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
    }
  );

  it.each([
    -1,
    500,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid offset %s before any API call", async (offset) => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);

    await expect(
      service.prepareSavedTracksPage(offset, accessToken)
    ).rejects.toBeInstanceOf(RangeError);
    expect(dependencies.getCurrentUserSavedTracks).not.toHaveBeenCalled();
    expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("accepts an empty library without requesting audio", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items: [] })
    );
    const service = createPlaylistDatasetService(dependencies);

    await expect(
      service.prepareSavedTracksPage(0, accessToken)
    ).resolves.toEqual({
      preparedDataset: {
        dataset: { version: 1, tracks: [] },
        skippedTracks: [],
        incompleteTracks: [],
      },
      pagination: {
        offset: 0,
        processedItems: 0,
        totalItems: 0,
        nextOffset: null,
      },
      unavailableItemsCount: 0,
    });
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
    expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
  });

  it("counts unavailable positions without using the prepared track count as the next offset", async () => {
    const dependencies = createDependencies();
    const missingItem = { ...createItem(thirdId), track: null };
    const items = [
      createItem(firstId),
      missingItem,
      createItem("B".repeat(22), { is_local: true }),
      createItem("C".repeat(22), { is_playable: false }),
      createItem("invalid-id"),
      createItem(secondId),
    ];
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items, total: 132 })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(result.unavailableItemsCount).toBe(4);
    expect(result.pagination).toEqual({
      offset: 0,
      processedItems: 6,
      totalItems: 132,
      nextOffset: 6,
    });
    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual([firstId, secondId]);
    expect(result.preparedDataset.skippedTracks).toEqual([]);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([firstId, secondId]);
  });

  it.each([
    "",
    " ",
    "a".repeat(21),
    "a".repeat(23),
    "a".repeat(21) + "-",
    ` ${firstId}`,
    `spotify:track:${firstId}`,
  ])("counts an invalid Spotify ID as unavailable: %s", async (id) => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items: [createItem(id)], total: 100 })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(result.preparedDataset).toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(result.unavailableItemsCount).toBe(1);
    expect(result.pagination.nextOffset).toBe(1);
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("deduplicates eligible IDs within a page while preserving the first metadata and source progress", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [
          createItem(firstId, { name: "First occurrence" }),
          createItem(firstId, { name: "Do not replace" }),
          createItem(secondId),
          createItem(firstId),
        ],
        total: 10,
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual([firstId, secondId]);
    expect(result.preparedDataset.dataset.tracks[0].name).toBe(
      "First occurrence"
    );
    expect(result.unavailableItemsCount).toBe(0);
    expect(result.pagination.processedItems).toBe(4);
    expect(result.pagination.nextOffset).toBe(4);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([firstId, secondId]);
  });

  it("does not mark a playable occurrence as a duplicate of an excluded local occurrence", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [createItem(firstId, { is_local: true }), createItem(firstId)],
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual([firstId]);
    expect(result.unavailableItemsCount).toBe(1);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([firstId]);
  });

  it("keeps case-sensitive IDs distinct", async () => {
    const dependencies = createDependencies();
    const ids = ["A".repeat(22), "a".repeat(22)];
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items: ids.map((id) => createItem(id)) })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual(ids);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith(ids);
  });

  it("reports empty metadata separately from unavailable library positions", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [
          createItem(firstId, { name: " " }),
          createItem(secondId, { artists: [{ name: " " }] }),
          createItem(thirdId),
        ],
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual([thirdId]);
    expect(result.preparedDataset.skippedTracks).toEqual([
      { spotifyId: firstId, reason: "metadata-unavailable" },
      { spotifyId: secondId, reason: "metadata-unavailable" },
    ]);
    expect(result.unavailableItemsCount).toBe(0);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([thirdId]);
  });

  it("does not replace unusable metadata with a later duplicate", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [createItem(firstId, { name: " " }), createItem(firstId)],
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(result.preparedDataset.dataset.tracks).toEqual([]);
    expect(result.preparedDataset.skippedTracks).toEqual([
      { spotifyId: firstId, reason: "metadata-unavailable" },
    ]);
    expect(result.unavailableItemsCount).toBe(0);
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("joins reversed measurements by ID and preserves partial measurements, zero and missing results", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({
        items: [createItem(firstId), createItem(secondId), createItem(thirdId)],
      })
    );
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      createAudioFeatures(thirdId, { tempo: 140 }),
      createAudioFeatures("not-requested"),
      createAudioFeatures(firstId, { tempo: null, energy: 0 }),
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => [
        track.id,
        track.audioFeatures.tempo,
      ])
    ).toEqual([
      [firstId, null],
      [thirdId, 140],
    ]);
    expect(result.preparedDataset.dataset.tracks[0].audioFeatures.energy).toBe(
      0
    );
    expect(result.preparedDataset.incompleteTracks).toEqual([
      { spotifyId: firstId, missingFeatures: ["tempo"] },
    ]);
    expect(result.preparedDataset.skippedTracks).toEqual([
      { spotifyId: secondId, reason: "audio-features-unavailable" },
    ]);
    expect(result.unavailableItemsCount).toBe(0);
    expect(result.pagination.processedItems).toBe(3);
  });

  it.each([401, 403, 404, 429, 503])(
    "propagates a whole library HTTP %s failure without an empty success",
    async (upstreamStatus) => {
      const dependencies = createDependencies();
      const error = new IntegrationApiError(
        "spotify",
        "Library request failed",
        { upstreamStatus, retryAfterSeconds: 30 }
      );
      dependencies.getCurrentUserSavedTracks.mockRejectedValue(error);
      const service = createPlaylistDatasetService(dependencies);

      await expect(service.prepareSavedTracksPage(0, accessToken)).rejects.toBe(
        error
      );
      expect(dependencies.getCurrentUserSavedTracks).toHaveBeenCalledOnce();
      expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
      expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
    }
  );

  it("does not return a partial page after a later audio chunk fails and fetches the page again on retry", async () => {
    const dependencies = createDependencies();
    const ids = createIds(50);
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items: ids.map((id) => createItem(id)) })
    );
    const error = new IntegrationApiError("reccobeats", "Rate limit", {
      category: "rate-limited",
      upstreamStatus: 429,
      retryAfterSeconds: 30,
    });
    dependencies.getAudioFeaturesBySpotifyIds
      .mockImplementationOnce(async (requestedIds) =>
        requestedIds.map((id) => createAudioFeatures(id))
      )
      .mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);

    await expect(service.prepareSavedTracksPage(0, accessToken)).rejects.toBe(
      error
    );
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledTimes(2);

    const result = await service.prepareSavedTracksPage(0, "renewed-token");

    expect(dependencies.getCurrentUserSavedTracks).toHaveBeenCalledTimes(2);
    expect(dependencies.getCurrentUserSavedTracks).toHaveBeenLastCalledWith(
      "renewed-token",
      { limit: 50, offset: 0 }
    );
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledTimes(4);
    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual(ids);
    expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
  });

  it("does not reuse or overwrite metadata cached by file preparation", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockResolvedValue({
      name: "File song",
      artists: [{ name: "File artist" }],
    });
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(
      createPage({ items: [createItem(firstId, { name: "Library song" })] })
    );
    const service = createPlaylistDatasetService(dependencies);
    const file: PlaylistTrackIdsFile = {
      version: 1,
      spotifyTrackIds: [firstId],
    };
    await service.prepareDataset(file, accessToken, "file-session");

    const saved = await service.prepareSavedTracksPage(0, accessToken);
    const cachedFile = await service.prepareDataset(
      file,
      accessToken,
      "file-session"
    );

    expect(saved.preparedDataset.dataset.tracks[0].name).toBe("Library song");
    expect(cachedFile.dataset.tracks[0].name).toBe("File song");
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
  });

  it("keeps each page's IDs and progress independent", async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUserSavedTracks
      .mockResolvedValueOnce(
        createPage({ items: [createItem(firstId)], total: 51 })
      )
      .mockResolvedValueOnce(
        createPage({ items: [createItem(secondId)], offset: 50, total: 51 })
      );
    const service = createPlaylistDatasetService(dependencies);
    await service.prepareSavedTracksPage(0, accessToken);

    const result = await service.prepareSavedTracksPage(50, accessToken);

    expect(
      result.preparedDataset.dataset.tracks.map((track) => track.id)
    ).toEqual([secondId]);
    expect(result.preparedDataset.skippedTracks).toEqual([]);
    expect(result.pagination).toEqual({
      offset: 50,
      processedItems: 1,
      totalItems: 51,
      nextOffset: null,
    });
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenLastCalledWith([
      secondId,
    ]);
  });

  it("does not mutate source metadata or saved item wrappers", async () => {
    const dependencies = createDependencies();
    const item = createItem(firstId, {
      name: " Song ",
      artists: [{ name: " Artist " }],
    });
    const page = createPage({ items: [item] });
    const original = structuredClone(page);
    if (item.track) {
      Object.freeze(item.track.artists[0]);
      Object.freeze(item.track.artists);
      Object.freeze(item.track);
    }
    Object.freeze(item);
    Object.freeze(page.items);
    Object.freeze(page);
    dependencies.getCurrentUserSavedTracks.mockResolvedValue(page);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareSavedTracksPage(0, accessToken);

    result.preparedDataset.dataset.tracks[0].artists.push("Other artist");
    expect(page).toEqual(original);
  });
});

function createDependencies() {
  return {
    getPlaylistMetadata:
      vi.fn<PlaylistDatasetDependencies["getPlaylistMetadata"]>(),
    getPlaylistItemsPage:
      vi.fn<PlaylistDatasetDependencies["getPlaylistItemsPage"]>(),
    getCurrentUserSavedTracks: vi
      .fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>()
      .mockResolvedValue(createPage()),
    getSpotifyTrackById: vi
      .fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>()
      .mockRejectedValue(
        new Error("Unexpected individual Spotify metadata request")
      ),
    getAudioFeaturesBySpotifyIds: vi
      .fn<PlaylistDatasetDependencies["getAudioFeaturesBySpotifyIds"]>()
      .mockImplementation(async (ids) =>
        ids.map((id) => createAudioFeatures(id))
      ),
  };
}

function createPage(
  overrides: Partial<SpotifySavedTracksApiResponse> = {}
): SpotifySavedTracksApiResponse {
  const items = overrides.items ?? [createItem(firstId), createItem(secondId)];
  const offset = overrides.offset ?? 0;
  const limit = overrides.limit ?? 50;
  const total = overrides.total ?? offset + items.length;
  return {
    href: `https://spotify.test/v1/me/tracks?limit=${limit}&offset=${offset}`,
    items,
    limit,
    offset,
    total,
    next: offset + items.length < total ? "https://spotify.test/next" : null,
    previous: offset > 0 ? "https://spotify.test/previous" : null,
    ...overrides,
  };
}

function createItem(
  id: string,
  overrides: Partial<SpotifyLibraryTrack> = {}
): SpotifySavedTrackApiResponse {
  return {
    added_at: "2026-10-15T08:00:00Z",
    track: {
      id,
      name: `Song ${id}`,
      artists: [{ name: "Artist" }],
      ...overrides,
    },
  };
}

function createIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    String(index).padStart(22, "0")
  );
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<TrackAudioFeatures> = {}
): TrackAudioFeatures {
  return {
    id: `audio-${spotifyId}`,
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
    ...overrides,
  };
}
