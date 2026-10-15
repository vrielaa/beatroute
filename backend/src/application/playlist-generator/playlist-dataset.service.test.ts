import { describe, expect, it, vi } from "vitest";
import type { PlaylistAudioFeatures } from "@domain/playlist-generator/types.js";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";
import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { createPlaylistDatasetService } from "./playlist-dataset.service.js";
import type {
  PlaylistDatasetDependencies,
  PlaylistSourceTrack,
  PlaylistTrackIdsFile,
} from "./types.js";

const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const accessToken = "spotify-access-token";

describe("playlist dataset preparation", () => {
  it("builds the generator dataset with trimmed metadata and eight measurements", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockResolvedValue({
      name: "  Song  ",
      artists: [{ name: " Artist " }, { name: " " }, { name: "Guest" }],
    });
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId]),
      accessToken
    );

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledWith(
      firstId,
      accessToken
    );
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledOnce();
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledWith([
      firstId,
    ]);
    expect(result).toEqual({
      dataset: {
        version: 1,
        tracks: [
          {
            id: firstId,
            name: "Song",
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
    });
    expect(parsePlaylistGeneratorDataset(result.dataset)).toEqual(
      result.dataset
    );
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });

  it("joins measurements by Spotify ID rather than their response position", async () => {
    const dependencies = createDependencies();
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      createAudioFeatures(secondId, { tempo: 140 }),
      createAudioFeatures("not-requested", { tempo: 200 }),
      createAudioFeatures(firstId, { tempo: 100 }),
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken
    );

    expect(
      result.dataset.tracks.map((track) => [
        track.id,
        track.audioFeatures.tempo,
      ])
    ).toEqual([
      [firstId, 100],
      [secondId, 140],
    ]);
    expect(result.dataset.tracks.map((track) => track.name)).toEqual([
      `Song ${firstId}`,
      `Song ${secondId}`,
    ]);
  });

  it("preserves requested IDs even when Spotify returns another ID", async () => {
    const dependencies = createDependencies();
    const source = { ...createSourceTrack(firstId), id: secondId };
    dependencies.getSpotifyTrackById.mockResolvedValue(source);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId]),
      accessToken
    );

    expect(result.dataset.tracks[0].id).toBe(firstId);
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledWith([
      firstId,
    ]);
  });

  it("finishes reading metadata before starting audio preparation", async () => {
    const dependencies = createDependencies();
    let releaseSecondMetadata: () => void = () => {
      throw new Error("Metadata request has not started");
    };
    const secondMetadata = new Promise<PlaylistSourceTrack>((resolve) => {
      releaseSecondMetadata = () => resolve(createSourceTrack(secondId));
    });
    dependencies.getSpotifyTrackById
      .mockResolvedValueOnce(createSourceTrack(firstId))
      .mockReturnValueOnce(secondMetadata);
    const service = createPlaylistDatasetService(dependencies);

    const preparation = service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken
    );
    await vi.waitFor(() => {
      expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    });
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();

    releaseSecondMetadata();
    const result = await preparation;

    expect(result.dataset.tracks.map((track) => track.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith([firstId, secondId]);
  });

  it("skips a Spotify 404 and requests audio only for tracks with metadata", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockRejectedValueOnce(
      new IntegrationApiError("spotify", "Track not found", {
        upstreamStatus: 404,
      })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken
    );

    expect(result.dataset.tracks.map((track) => track.id)).toEqual([secondId]);
    expect(result.skippedTracks).toEqual([
      { spotifyId: firstId, reason: "metadata-unavailable" },
    ]);
    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(2);
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledWith([
      secondId,
    ]);
  });

  it.each([
    { name: " ", artists: [{ name: "Artist" }] },
    { name: "Song", artists: [] },
    { name: "Song", artists: [{ name: " " }] },
  ])(
    "skips metadata without a usable title or artist: %j",
    async (metadata) => {
      const dependencies = createDependencies();
      dependencies.getSpotifyTrackById.mockResolvedValueOnce(metadata);
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareDataset(
        createFile([firstId, secondId]),
        accessToken
      );

      expect(result.dataset.tracks.map((track) => track.id)).toEqual([
        secondId,
      ]);
      expect(result.skippedTracks).toEqual([
        { spotifyId: firstId, reason: "metadata-unavailable" },
      ]);
      expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledWith([
        secondId,
      ]);
    }
  );

  it.each(["name", "artists"])(
    "handles a missing metadata property: %s",
    async (property) => {
      const dependencies = createDependencies();
      const metadata = createSourceTrack(firstId);
      Reflect.deleteProperty(metadata, property);
      dependencies.getSpotifyTrackById.mockResolvedValue(metadata);
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareDataset(
        createFile([firstId]),
        accessToken
      );

      expect(result).toEqual({
        dataset: { version: 1, tracks: [] },
        skippedTracks: [{ spotifyId: firstId, reason: "metadata-unavailable" }],
        incompleteTracks: [],
      });
      expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
    }
  );

  it("reports unavailable audio without exposing provider error messages", async () => {
    const dependencies = createDependencies();
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      {
        spotifyId: firstId,
        error: `Provider diagnostic containing ${accessToken}`,
      },
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken
    );

    expect(result).toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [
        { spotifyId: firstId, reason: "audio-features-unavailable" },
        { spotifyId: secondId, reason: "audio-features-unavailable" },
      ],
      incompleteTracks: [],
    });
    expect(JSON.stringify(result)).not.toContain(accessToken);
  });

  it("keeps partial measurements and lists missing features in a fixed order", async () => {
    const dependencies = createDependencies();
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      createAudioFeatures(firstId, {
        tempo: null,
        energy: null,
        liveness: null,
      }),
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId]),
      accessToken
    );

    expect(result.dataset.tracks).toHaveLength(1);
    expect(result.dataset.tracks[0].audioFeatures).toMatchObject({
      tempo: null,
      energy: null,
      liveness: null,
      danceability: 0.7,
    });
    expect(result.skippedTracks).toEqual([]);
    expect(result.incompleteTracks).toEqual([
      { spotifyId: firstId, missingFeatures: ["tempo", "energy", "liveness"] },
    ]);
  });

  it("skips a track when all eight generator measurements are missing", async () => {
    const dependencies = createDependencies();
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      createAudioFeatures(firstId, {
        tempo: null,
        energy: null,
        danceability: null,
        valence: null,
        acousticness: null,
        instrumentalness: null,
        speechiness: null,
        liveness: null,
      }),
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId]),
      accessToken
    );

    expect(result).toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [
        { spotifyId: firstId, reason: "audio-features-unavailable" },
      ],
      incompleteTracks: [],
    });
  });

  it.each([0, 1])(
    "keeps boundary measurements %s instead of treating them as missing",
    async (value) => {
      const dependencies = createDependencies();
      dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
        createAudioFeatures(firstId, {
          tempo: 1,
          energy: value,
          danceability: value,
          valence: value,
          acousticness: value,
          instrumentalness: value,
          speechiness: value,
          liveness: value,
        }),
      ]);
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareDataset(
        createFile([firstId]),
        accessToken
      );

      expect(result.dataset.tracks[0].audioFeatures).toEqual({
        tempo: 1,
        energy: value,
        danceability: value,
        valence: value,
        acousticness: value,
        instrumentalness: value,
        speechiness: value,
        liveness: value,
      });
      expect(result.skippedTracks).toEqual([]);
      expect(result.incompleteTracks).toEqual([]);
    }
  );

  const unitFeatures: (keyof PlaylistAudioFeatures)[] = [
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
  ];

  describe.each(unitFeatures)("normalization of %s", (feature) => {
    it.each([-0.01, 1.01, NaN, Infinity, -Infinity, undefined, "0.5"])(
      "represents an invalid measurement %s as null",
      async (value) => {
        const dependencies = createDependencies();
        const audio = createAudioFeatures(firstId);
        Reflect.set(audio, feature, value);
        dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([audio]);
        const service = createPlaylistDatasetService(dependencies);

        const result = await service.prepareDataset(
          createFile([firstId]),
          accessToken
        );

        expect(result.dataset.tracks[0].audioFeatures[feature]).toBeNull();
        expect(result.incompleteTracks).toEqual([
          { spotifyId: firstId, missingFeatures: [feature] },
        ]);
        expect(result.skippedTracks).toEqual([]);
      }
    );
  });

  it.each([0, -1, NaN, Infinity, -Infinity, undefined, "125"])(
    "represents an invalid tempo %s as null",
    async (tempo) => {
      const dependencies = createDependencies();
      const audio = createAudioFeatures(firstId);
      Reflect.set(audio, "tempo", tempo);
      dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([audio]);
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareDataset(
        createFile([firstId]),
        accessToken
      );

      expect(result.dataset.tracks[0].audioFeatures.tempo).toBeNull();
      expect(result.incompleteTracks).toEqual([
        { spotifyId: firstId, missingFeatures: ["tempo"] },
      ]);
    }
  );

  it("keeps source order in the dataset, skipped tracks and incomplete tracks", async () => {
    const dependencies = createDependencies();
    const spotifyTrackIds = createIds(5);
    dependencies.getSpotifyTrackById.mockRejectedValueOnce(
      new IntegrationApiError("spotify", "Not found", { upstreamStatus: 404 })
    );
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([
      createAudioFeatures(spotifyTrackIds[4], { acousticness: null }),
      { spotifyId: spotifyTrackIds[2], error: "Not found" },
      createAudioFeatures(spotifyTrackIds[3]),
      createAudioFeatures(spotifyTrackIds[1], { energy: null }),
    ]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile(spotifyTrackIds),
      accessToken
    );

    expect(result.dataset.tracks.map((track) => track.id)).toEqual([
      spotifyTrackIds[1],
      spotifyTrackIds[3],
      spotifyTrackIds[4],
    ]);
    expect(result.skippedTracks).toEqual([
      { spotifyId: spotifyTrackIds[0], reason: "metadata-unavailable" },
      { spotifyId: spotifyTrackIds[2], reason: "audio-features-unavailable" },
    ]);
    expect(result.incompleteTracks).toEqual([
      { spotifyId: spotifyTrackIds[1], missingFeatures: ["energy"] },
      { spotifyId: spotifyTrackIds[4], missingFeatures: ["acousticness"] },
    ]);
  });

  it("does not call APIs for an empty list", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);

    await expect(
      service.prepareDataset(createFile([]), accessToken)
    ).resolves.toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [],
      incompleteTracks: [],
    });
    expect(dependencies.getSpotifyTrackById).not.toHaveBeenCalled();
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("does not request measurements when no metadata is available", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockRejectedValue(
      new IntegrationApiError("spotify", "Not found", { upstreamStatus: 404 })
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(
      createFile([firstId, secondId]),
      accessToken
    );

    expect(result.dataset.tracks).toEqual([]);
    expect(result.skippedTracks).toHaveLength(2);
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it.each([40, 41, 81, 500])(
    "limits audio request payloads to 40 IDs for %s tracks",
    async (count) => {
      const dependencies = createDependencies();
      const spotifyTrackIds = createIds(count);
      const service = createPlaylistDatasetService(dependencies);

      const result = await service.prepareDataset(
        createFile(spotifyTrackIds),
        accessToken
      );

      expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(count);
      expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledTimes(
        Math.ceil(count / 40)
      );
      const requestedChunks =
        dependencies.getAudioFeaturesBySpotifyIds.mock.calls.map(
          ([ids]) => ids
        );
      expect(requestedChunks.flat()).toEqual(spotifyTrackIds);
      expect(
        requestedChunks.every((ids) => ids.length > 0 && ids.length <= 40)
      ).toBe(true);
      expect(result.dataset.tracks.map((track) => track.id)).toEqual(
        spotifyTrackIds
      );
    }
  );

  it("forms audio chunks after removing unusable metadata and preserves all result orders", async () => {
    const dependencies = createDependencies();
    const ids = createIds(43);
    const missingMetadataIds = [ids[0], ids[20], ids[42]];
    const availableIds = ids.filter((id) => !missingMetadataIds.includes(id));
    dependencies.getSpotifyTrackById.mockImplementation(async (id) => {
      if (id === ids[0] || id === ids[42]) {
        throw new IntegrationApiError("spotify", "Not found", {
          upstreamStatus: 404,
        });
      }
      if (id === ids[20]) {
        return { name: " ", artists: [{ name: "Artist" }] };
      }
      return createSourceTrack(id);
    });
    dependencies.getAudioFeaturesBySpotifyIds.mockImplementation(
      async (requestedIds) =>
        requestedIds
          .filter((id) => id !== ids[41])
          .map((id) =>
            createAudioFeatures(
              id,
              id === ids[21] ? { tempo: null, energy: 0 } : {}
            )
          )
          .reverse()
    );
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(createFile(ids), accessToken);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledTimes(43);
    expect(
      dependencies.getAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledExactlyOnceWith(availableIds);
    expect(result.dataset.tracks.map((track) => track.id)).toEqual(
      availableIds.filter((id) => id !== ids[41])
    );
    expect(result.skippedTracks).toEqual([
      { spotifyId: ids[0], reason: "metadata-unavailable" },
      { spotifyId: ids[20], reason: "metadata-unavailable" },
      { spotifyId: ids[41], reason: "audio-features-unavailable" },
      { spotifyId: ids[42], reason: "metadata-unavailable" },
    ]);
    expect(result.incompleteTracks).toEqual([
      { spotifyId: ids[21], missingFeatures: ["tempo"] },
    ]);
    expect(
      result.dataset.tracks.find((track) => track.id === ids[21])?.audioFeatures
        .energy
    ).toBe(0);
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "propagates Spotify status %s instead of reporting a missing track",
    async (upstreamStatus) => {
      const dependencies = createDependencies();
      const error = new IntegrationApiError("spotify", "Spotify failure", {
        upstreamStatus,
      });
      dependencies.getSpotifyTrackById.mockRejectedValueOnce(error);
      const service = createPlaylistDatasetService(dependencies);

      await expect(
        service.prepareDataset(createFile([firstId, secondId]), accessToken)
      ).rejects.toBe(error);

      expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
      expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
    }
  );

  it.each([
    new IntegrationApiError("spotify", "No connection", {
      category: "network",
    }),
    new IntegrationApiError("spotify", "Timeout", { category: "timeout" }),
    new Error("Unexpected application error"),
  ])("propagates metadata errors: %s", async (error) => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackById.mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);

    await expect(
      service.prepareDataset(createFile([firstId, secondId]), accessToken)
    ).rejects.toBe(error);

    expect(dependencies.getSpotifyTrackById).toHaveBeenCalledOnce();
    expect(dependencies.getAudioFeaturesBySpotifyIds).not.toHaveBeenCalled();
  });

  it("propagates a whole audio request failure and does not start later chunks", async () => {
    const dependencies = createDependencies();
    const error = new IntegrationApiError("reccobeats", "API unavailable", {
      category: "unavailable",
      upstreamStatus: 503,
    });
    dependencies.getAudioFeaturesBySpotifyIds.mockRejectedValueOnce(error);
    const service = createPlaylistDatasetService(dependencies);

    await expect(
      service.prepareDataset(createFile(createIds(81)), accessToken)
    ).rejects.toBe(error);

    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenCalledOnce();
  });

  it("does not modify the file or source objects", async () => {
    const dependencies = createDependencies();
    const file = createFile([firstId]);
    const metadata = createSourceTrack(firstId);
    const audio = createAudioFeatures(firstId);
    const originalFile = structuredClone(file);
    const originalMetadata = structuredClone(metadata);
    const originalAudio = structuredClone(audio);
    Object.freeze(file.spotifyTrackIds);
    Object.freeze(file);
    Object.freeze(metadata.artists[0]);
    Object.freeze(metadata.artists);
    Object.freeze(metadata);
    Object.freeze(audio);
    dependencies.getSpotifyTrackById.mockResolvedValue(metadata);
    dependencies.getAudioFeaturesBySpotifyIds.mockResolvedValue([audio]);
    const service = createPlaylistDatasetService(dependencies);

    const result = await service.prepareDataset(file, accessToken);

    expect(file).toEqual(originalFile);
    expect(metadata).toEqual(originalMetadata);
    expect(audio).toEqual(originalAudio);
    expect(result.dataset.tracks[0].audioFeatures).not.toBe(audio);
    expect(result.dataset.tracks[0].artists).not.toBe(metadata.artists);
  });

  it("does not retain tracks, tokens or failures between preparations", async () => {
    const dependencies = createDependencies();
    const service = createPlaylistDatasetService(dependencies);

    await service.prepareDataset(createFile([firstId]), accessToken);
    const result = await service.prepareDataset(
      createFile([secondId]),
      "another-token"
    );

    expect(result.dataset.tracks.map((track) => track.id)).toEqual([secondId]);
    expect(result.skippedTracks).toEqual([]);
    expect(result.incompleteTracks).toEqual([]);
    expect(dependencies.getSpotifyTrackById).toHaveBeenLastCalledWith(
      secondId,
      "another-token"
    );
    expect(dependencies.getAudioFeaturesBySpotifyIds).toHaveBeenLastCalledWith([
      secondId,
    ]);
  });
});

function createFile(spotifyTrackIds: string[]): PlaylistTrackIdsFile {
  return { version: 1, spotifyTrackIds };
}

function createIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index.toString(36).padStart(22, "0")
  );
}

function createSourceTrack(spotifyId: string): PlaylistSourceTrack {
  return { name: `Song ${spotifyId}`, artists: [{ name: "Artist" }] };
}

function createDependencies() {
  return {
    getPlaylistMetadata:
      vi.fn<PlaylistDatasetDependencies["getPlaylistMetadata"]>(),
    getPlaylistItemsPage:
      vi.fn<PlaylistDatasetDependencies["getPlaylistItemsPage"]>(),
    getCurrentUserSavedTracks:
      vi.fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>(),
    getSpotifyTrackById: vi
      .fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>()
      .mockImplementation(async (spotifyId) => createSourceTrack(spotifyId)),
    getAudioFeaturesBySpotifyIds: vi
      .fn<PlaylistDatasetDependencies["getAudioFeaturesBySpotifyIds"]>()
      .mockImplementation(async (spotifyIds) =>
        spotifyIds.map((id) => createAudioFeatures(id))
      ),
  };
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<TrackAudioFeatures> = {}
): TrackAudioFeatures {
  return {
    id: `source-${spotifyId}`,
    spotifyId,
    acousticness: 0.2,
    danceability: 0.7,
    energy: 0.8,
    instrumentalness: 0.1,
    key: 2,
    liveness: 0.15,
    loudness: -5,
    mode: 1,
    speechiness: 0.05,
    tempo: 125,
    timeSignature: 4,
    valence: 0.65,
    ...overrides,
  };
}
