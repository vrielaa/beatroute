import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import type { PlaylistDatasetDependencies } from "@application/playlist-generator/types.js";
import { createReccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import type { ReccoBeatsGateway } from "@integrations/reccobeats/reccobeats.gateway.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { errorHandler } from "@http/error-handler.js";
import { createPlaylistGeneratorRouter } from "./routes.js";

const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const bestId = "A".repeat(22);
const incompleteId = "B".repeat(22);
const missingMetadataId = "C".repeat(22);
const missingAudioId = "D".repeat(22);

afterEach(() => vi.restoreAllMocks());

describe("Spotify ID file to playlist through actual services and HTTP", () => {
  it("prepares normalized data, filters before ranking and reuses the dataset for new criteria", async () => {
    const { browser, getSpotifyTrackById, gateway } = createFlow();
    getSpotifyTrackById.mockImplementation(async (id) => {
      if (id === missingMetadataId) {
        throw new SpotifyApiError("Track not found", 404);
      }
      return { name: ` Song ${id} `, artists: [{ name: " Artist " }] };
    });
    gateway.findTracksBySpotifyIds.mockResolvedValue(
      [incompleteId, bestId, secondId, firstId].map(createCatalogTrack)
    );
    gateway.getTrackAudioFeatures.mockImplementation(async (reccoId) => {
      if (reccoId === `recco-${firstId}`) return createAudio(100, 0.9);
      if (reccoId === `recco-${secondId}`) return createAudio(128, 0.625);
      if (reccoId === `recco-${incompleteId}`) return createAudio(null, 0.9);
      return createAudio(130, 0.9);
    });
    await browser.post("/test/login").expect(204);

    const prepared = await browser
      .post("/api/playlist-generator/prepare-dataset")
      .send({
        version: 1,
        spotifyTrackIds: [
          ` ${firstId} `,
          secondId,
          bestId,
          incompleteId,
          missingMetadataId,
          missingAudioId,
          firstId,
        ],
        accessToken: "ignored-token",
      })
      .expect(200);

    expect(
      prepared.body.dataset.tracks.map((track: { id: string }) => track.id)
    ).toEqual([firstId, secondId, bestId, incompleteId]);
    expect(prepared.body.dataset.tracks[0]).toMatchObject({
      name: `Song ${firstId}`,
      artists: ["Artist"],
    });
    expect(prepared.body.skippedTracks).toEqual([
      { spotifyId: missingMetadataId, reason: "metadata-unavailable" },
      { spotifyId: missingAudioId, reason: "audio-features-unavailable" },
    ]);
    expect(prepared.body.incompleteTracks).toEqual([
      { spotifyId: incompleteId, missingFeatures: ["tempo"] },
    ]);
    expect(getSpotifyTrackById).toHaveBeenCalledTimes(6);
    expect(getSpotifyTrackById).toHaveBeenCalledWith(firstId, "session-token");
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledExactlyOnceWith([
      firstId,
      secondId,
      bestId,
      incompleteId,
      missingAudioId,
    ]);
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(4);
    expect(prepared.text).not.toContain("session-token");
    expect(prepared.text).not.toContain("ignored-token");

    const preferences = {
      energy: "high",
      danceability: null,
      valence: null,
      acousticness: null,
      instrumentalness: null,
    };
    const generated = await browser
      .post("/api/playlist-generator/generate")
      .send({
        dataset: prepared.body.dataset,
        requirements: {
          targetBpm: null,
          tempoRange: { min: 120, max: 140 },
          maxSpeechiness: null,
          maxLiveness: null,
        },
        preferences,
      })
      .expect(200);

    expect(
      generated.body.rankedTracks.map(
        (item: { track: { id: string } }) => item.track.id
      )
    ).toEqual([bestId, secondId]);
    expect(
      generated.body.rankedTracks.map(
        (item: { overallMatch: number }) => item.overallMatch
      )
    ).toEqual([1, 0.5]);
    expect(generated.body.rejectedTracks).toEqual([
      {
        track: prepared.body.dataset.tracks[0],
        reasons: [{ feature: "tempo", code: "outside-range" }],
      },
      {
        track: prepared.body.dataset.tracks[3],
        reasons: [{ feature: "tempo", code: "missing-measurement" }],
      },
    ]);

    const regenerated = await browser
      .post("/api/playlist-generator/generate")
      .send({
        dataset: prepared.body.dataset,
        requirements: {
          targetBpm: null,
          tempoRange: null,
          maxSpeechiness: null,
          maxLiveness: null,
        },
        preferences: { ...preferences, energy: null },
      })
      .expect(200);

    expect(regenerated.body.rankedTracks).toEqual(
      prepared.body.dataset.tracks.map((track: unknown) => ({
        track,
        overallMatch: null,
        featureMatches: [],
      }))
    );
    expect(regenerated.body.rejectedTracks).toEqual([]);
    expect(getSpotifyTrackById).toHaveBeenCalledTimes(6);
    expect(gateway.findTracksBySpotifyIds).toHaveBeenCalledOnce();
    expect(gateway.getTrackAudioFeatures).toHaveBeenCalledTimes(4);
  });

  it("preserves rate-limit errors from actual audio reads and allows a successful retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { browser, gateway } = createFlow();
    gateway.findTracksBySpotifyIds.mockResolvedValue([
      createCatalogTrack(firstId),
    ]);
    gateway.getTrackAudioFeatures.mockRejectedValue(
      new ReccoBeatsApiError(
        "ReccoBeats rate limit",
        429,
        { token: "private-value" },
        { retryAfterSeconds: 30 }
      )
    );
    await browser.post("/test/login").expect(204);

    const failure = await browser
      .post("/api/playlist-generator/prepare-dataset")
      .send({ version: 1, spotifyTrackIds: [firstId] })
      .expect("Retry-After", "30")
      .expect(429);

    expect(failure.body.error.code).toBe("RECCOBEATS_API_ERROR");
    expect(failure.body.dataset).toBeUndefined();
    expect(failure.text).not.toContain("private-value");
    gateway.getTrackAudioFeatures.mockResolvedValue(createAudio(128, 0.8));

    const retry = await browser
      .post("/api/playlist-generator/prepare-dataset")
      .send({ version: 1, spotifyTrackIds: [firstId] })
      .expect(200);

    expect(retry.body.dataset.tracks).toHaveLength(1);
    expect(retry.body.skippedTracks).toEqual([]);
  });

  it("keeps expected 404 measurements as an empty success but rejects that dataset at generation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { browser, gateway } = createFlow();
    gateway.findTracksBySpotifyIds.mockResolvedValue([
      createCatalogTrack(firstId),
    ]);
    gateway.getTrackAudioFeatures.mockRejectedValue(
      new ReccoBeatsApiError("Measurements not found", 404, null)
    );
    await browser.post("/test/login").expect(204);

    const prepared = await browser
      .post("/api/playlist-generator/prepare-dataset")
      .send({ version: 1, spotifyTrackIds: [firstId] })
      .expect(200);

    expect(prepared.body).toEqual({
      dataset: { version: 1, tracks: [] },
      skippedTracks: [
        { spotifyId: firstId, reason: "audio-features-unavailable" },
      ],
      incompleteTracks: [],
    });
    const generated = await browser
      .post("/api/playlist-generator/generate")
      .send({ dataset: prepared.body.dataset })
      .expect(400);
    expect(generated.body.error.code).toBe("VALIDATION_ERROR");
  });
});

function createFlow() {
  const getSpotifyTrackById = vi
    .fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>()
    .mockResolvedValue({ name: "Song", artists: [{ name: "Artist" }] });
  const gateway = {
    findTracksBySpotifyIds:
      vi.fn<ReccoBeatsGateway["findTracksBySpotifyIds"]>(),
    getTrackAudioFeatures: vi.fn<ReccoBeatsGateway["getTrackAudioFeatures"]>(),
  };
  const audioService = createReccoBeatsService({ reccoBeatsGateway: gateway });
  const datasetService = createPlaylistDatasetService({
    getPlaylistMetadata:
      vi.fn<PlaylistDatasetDependencies["getPlaylistMetadata"]>(),
    getPlaylistItemsPage:
      vi.fn<PlaylistDatasetDependencies["getPlaylistItemsPage"]>(),
    getCurrentUserSavedTracks:
      vi.fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>(),
    getSpotifyTrackById,
    getAudioFeaturesBySpotifyIds:
      audioService.getManyTrackAudioFeaturesBySpotifyIds,
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      secret: "flow-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post("/test/login", (req, res) => {
    req.session.spotify = {
      accessToken: "session-token",
      refreshToken: "refresh-token",
      expiresAt: 4_600_000,
      scope: "user-top-read",
      tokenType: "Bearer",
    };
    res.sendStatus(204);
  });
  app.use(
    "/api/playlist-generator",
    createPlaylistGeneratorRouter({
      prepareDataset: datasetService.prepareDataset,
      prepareSavedTracksPage: datasetService.prepareSavedTracksPage,
      savePlaylist: vi
        .fn()
        .mockRejectedValue(new Error("Unexpected playlist save")),
      resumePlaylist: vi.fn(),
      authorize: createEnsureSpotifyAccessToken({
        refresh: async () => {
          throw new Error("Unexpected refresh");
        },
        now: () => 1_000_000,
      }),
    })
  );
  app.use(errorHandler);
  return { browser: request.agent(app), getSpotifyTrackById, gateway };
}

function createCatalogTrack(spotifyId: string) {
  return {
    id: `recco-${spotifyId}`,
    href: `https://open.spotify.com/track/${spotifyId}`,
    name: "Song",
  };
}

function createAudio(tempo: number | null, energy: number) {
  return {
    tempo,
    energy,
    danceability: 0.75,
    valence: 0.6,
    acousticness: 0.2,
    instrumentalness: 0.05,
    speechiness: 0.04,
    liveness: 0.1,
  };
}
