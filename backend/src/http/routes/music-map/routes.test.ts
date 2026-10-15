import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "@http/error-handler.js";
import { createMusicMapRouter } from "./routes.js";
import { MUSIC_MAP_FEATURE_KEYS } from "@domain/music-map/features.js";
import type { MusicMapService } from "@application/music-map/build-music-map.js";
import type {
  MusicMapDataset,
  MusicMapResult,
} from "@domain/music-map/types.js";
import type { RequestHandler } from "express";

describe("music map routes", () => {
  it("requires Spotify authorization before reading or analyzing a dataset", async () => {
    const dependencies = createDependencies();
    dependencies.authorize = (_request, response) => {
      response.status(401).json({ error: "Unauthorized" });
    };
    const app = createTestApp(dependencies);

    await request(app).get("/api/music-map/dataset").expect(401);
    await request(app)
      .post("/api/music-map/analysis")
      .send({ dataset: createMusicMapDataset(), clusterCount: 2 })
      .expect(401);

    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).not.toHaveBeenCalled();
  });

  it("loads a dataset with defaults and the access token from the session", async () => {
    const dependencies = createDependencies();
    const dataset = createMusicMapDataset();
    dependencies.musicMapService.getMusicMapDataset.mockResolvedValue(dataset);
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/music-map/dataset")
      .expect(200);

    expect(response.body).toEqual(dataset);
    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).toHaveBeenCalledWith({
      accessToken: "access-token",
      limit: 40,
      timeRange: "long_term",
    });
  });

  it("passes a validated range to dataset loading", async () => {
    const dependencies = createDependencies();
    dependencies.musicMapService.getMusicMapDataset.mockResolvedValue(
      createMusicMapDataset()
    );
    const app = createTestApp(dependencies);

    await request(app)
      .get("/api/music-map/dataset")
      .query({ limit: "15", time_range: "short_term" })
      .expect(200);

    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).toHaveBeenCalledWith({
      accessToken: "access-token",
      limit: 15,
      timeRange: "short_term",
    });
  });

  it("analyzes a previously loaded dataset without loading it again", async () => {
    const dependencies = createDependencies();
    const dataset = createMusicMapDataset();
    const result = createMusicMapResult();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/music-map/analysis")
      .send({ dataset, clusterCount: 3 })
      .expect(200);

    expect(response.body).toEqual(result);
    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).not.toHaveBeenCalled();
  });

  it("analyzes a track using the real domain function without loading provider data", async () => {
    const dependencies = createDependencies();
    const dataset = createMusicMapDataset();
    dataset.tracks = [
      {
        id: "track-1",
        name: "Track",
        artists: ["Artist"],
        album: null,
        imageUrl: null,
        spotifyUrl: null,
      },
    ];
    dataset.audioFeatures = [
      {
        status: "found",
        trackId: "track-1",
        features: {
          acousticness: 0.2,
          danceability: 0.7,
          energy: 0.8,
          instrumentalness: 0.1,
          liveness: 0.15,
          speechiness: 0.05,
          valence: 0.65,
          loudness: -5,
          tempo: 125,
          key: 4,
          mode: 1,
        },
      },
    ];
    dataset.metadata.spotifyReturnedTracksCount = 1;
    dataset.metadata.spotifyTotalTracksCount = 1;
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/music-map/analysis")
      .send({ dataset, clusterCount: 2 })
      .expect(200);

    expect(response.body).toMatchObject({
      requestedClusterCount: 2,
      selectedClusterCount: 1,
      tracksWithAudioFeaturesCount: 1,
      skippedTracksCount: 0,
      points: [
        expect.objectContaining({
          id: "track-1",
          name: "Track",
          cluster: 0,
          x: 0,
          y: 0,
        }),
      ],
      clusters: [
        expect.objectContaining({ trackIds: ["track-1"], tracksCount: 1 }),
      ],
    });
    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).not.toHaveBeenCalled();
  });

  it("rejects an invalid analysis body without loading provider data", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/music-map/analysis")
      .send({ dataset: {}, clusterCount: 9 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).not.toHaveBeenCalled();
  });

  it("rejects an invalid cluster count for a valid dataset", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/music-map/analysis")
      .send({ dataset: createMusicMapDataset(), clusterCount: -1 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      dependencies.musicMapService.getMusicMapDataset
    ).not.toHaveBeenCalled();
  });
});

function createDependencies() {
  const authorize: RequestHandler = (req, _res, next) => {
    req.session.spotify = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-top-read",
      tokenType: "Bearer",
    };
    next();
  };

  return {
    musicMapService: {
      getMusicMapDataset: vi.fn<MusicMapService["getMusicMapDataset"]>(),
    },
    authorize,
  };
}

function createTestApp(
  dependencies: Parameters<typeof createMusicMapRouter>[0]
) {
  const app = express();

  app.use(express.json());
  app.use(
    session({
      secret: "music-map-routes-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use("/api/music-map", createMusicMapRouter(dependencies));
  app.use(errorHandler);

  return app;
}

function createMusicMapDataset(): MusicMapDataset {
  return {
    tracks: [],
    audioFeatures: [],
    metadata: {
      timeRange: "long_term",
      requestedLimit: 40,
      spotifyReturnedTracksCount: 0,
      spotifyTotalTracksCount: 0,
    },
  };
}

function createMusicMapResult(): MusicMapResult {
  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    timeRange: "long_term",
    requestedLimit: 40,
    spotifyReturnedTracksCount: 0,
    spotifyTotalTracksCount: 0,
    requestedClusterCount: 3,
    selectedClusterCount: 0,
    selectedClusterCountSource: "fallback",
    appliedClusterCount: 0,
    candidateClusterResults: [],
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    activeFeatureKeys: [],
    explainedVariance: [],
    tracksWithAudioFeaturesCount: 0,
    skippedTracksCount: 0,
    clusters: [],
    points: [],
    skippedTracks: [],
  };
}
