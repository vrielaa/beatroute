import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "@http/error-response.js";
import { createMusicMapRouter } from "./routes.js";
import type { MusicMapService } from "@domain/music-map/service.js";
import type { MusicMapResult } from "@domain/music-map/types.js";
import type { RequestHandler } from "express";

describe("music map routes", () => {
  it("requires Spotify authorization before building a map", async () => {
    const dependencies = createDependencies();
    dependencies.authorize = (_request, response) => {
      response.status(401).json({ error: "Unauthorized" });
    };
    const app = createTestApp(dependencies);

    await request(app).get("/api/music-map/playground").expect(401);

    expect(dependencies.musicMapService.buildMusicMap).not.toHaveBeenCalled();
  });

  it("uses music map defaults and the access token from the session", async () => {
    const dependencies = createDependencies();
    dependencies.musicMapService.buildMusicMap.mockResolvedValue(
      createMusicMapResult()
    );
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/music-map/playground")
      .expect(200);

    expect(response.body).toEqual(createMusicMapResult());
    expect(dependencies.musicMapService.buildMusicMap).toHaveBeenCalledWith({
      accessToken: "access-token",
      limit: 40,
      timeRange: "long_term",
      clusterCount: null,
    });
  });

  it("passes validated query parameters to the service", async () => {
    const dependencies = createDependencies();
    dependencies.musicMapService.buildMusicMap.mockResolvedValue(
      createMusicMapResult()
    );
    const app = createTestApp(dependencies);

    await request(app)
      .get("/api/music-map/playground")
      .query({ limit: "15", time_range: "short_term", clusters: "3" })
      .expect(200);

    expect(dependencies.musicMapService.buildMusicMap).toHaveBeenCalledWith({
      accessToken: "access-token",
      limit: 15,
      timeRange: "short_term",
      clusterCount: 3,
    });
  });

  it("rejects invalid parameters before calling the service", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/music-map/playground")
      .query({ clusters: "1" })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: 'Parametr "clusters" musi być liczbą całkowitą od 2 do 8',
      },
    });
    expect(dependencies.musicMapService.buildMusicMap).not.toHaveBeenCalled();
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
      buildMusicMap: vi.fn<MusicMapService["buildMusicMap"]>(),
    },
    authorize,
  };
}

function createTestApp(
  dependencies: Parameters<typeof createMusicMapRouter>[0]
) {
  const app = express();

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

function createMusicMapResult(): MusicMapResult {
  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    timeRange: "long_term",
    requestedLimit: 40,
    spotifyReturnedTracksCount: 0,
    spotifyTotalTracksCount: 0,
    requestedClusterCount: null,
    selectedClusterCount: 0,
    selectedClusterCountSource: "fallback",
    appliedClusterCount: 0,
    candidateClusterResults: [],
    featureKeys: [],
    activeFeatureKeys: [],
    explainedVariance: [],
    tracksWithAudioFeaturesCount: 0,
    skippedTracksCount: 0,
    clusters: [],
    points: [],
    skippedTracks: [],
  };
}
