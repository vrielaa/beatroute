import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler, notFoundHandler } from "@http/error-handler.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { createTrackRouter } from "./routes.js";
import { createTrackAnalysisService } from "@application/tracks/track-analysis.service.js";
import type { RequestHandler } from "express";
import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
} from "@domain/tracks/types.js";

describe("track routes", () => {
  it("summarizes collected raw measurements once without reading any provider", async () => {
    const dependencies = createRouteDependencies();
    const response = await request(createTestApp(dependencies))
      .post("/api/tracks/statistics")
      .send({
        audioFeatures: [
          createAudioFeatures("one", { tempo: 100, liveness: 0.9 }),
          createAudioFeatures("two", { tempo: 120, liveness: null }),
          createAudioFeatures("three", { tempo: 200, liveness: 0.1 }),
        ],
      })
      .expect(200);
    expect(response.body).toMatchObject({
      averageBpm: 140,
      totalTracksCount: 3,
      foundTracksCount: 3,
      liveTrackPercentage: 50,
    });
    expect(
      dependencies.trackAnalysisService.getTracksAnalysis
    ).not.toHaveBeenCalled();
    expect(dependencies.getSoundchartsAudioFeatures).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { audioFeatures: null },
    { audioFeatures: [{ spotifyId: "one", error: "Not found" }] },
    { audioFeatures: [null] },
    { audioFeatures: [{ spotifyId: " " }] },
    { audioFeatures: [{ spotifyId: "one", energy: "0.5" }] },
    { audioFeatures: [{ spotifyId: "one" }, { spotifyId: " one " }] },
    {
      audioFeatures: Array.from({ length: 41 }, (_, index) => ({
        spotifyId: String(index),
      })),
    },
  ])("rejects invalid local measurements: %j", async (body) => {
    await request(createTestApp(createRouteDependencies()))
      .post("/api/tracks/statistics")
      .send(body)
      .expect(400);
  });

  it("accepts zero and missing measurements without inventing data", async () => {
    const response = await request(createTestApp(createRouteDependencies()))
      .post("/api/tracks/statistics")
      .send({
        audioFeatures: [{ spotifyId: "one", energy: 0, liveness: null }],
      })
      .expect(200);
    expect(response.body.averageEnergy).toBe(0);
    expect(response.body.liveTrackPercentage).toBeNull();
  });

  it("returns nullable percentages and measurement counts through /analysis", async () => {
    const dependencies = createRouteDependencies();
    const audioFeaturesReader = {
      getManyTrackAudioFeaturesBySpotifyIds: vi.fn().mockResolvedValue([
        createAudioFeatures("measured", {
          liveness: 0.9,
          instrumentalness: null,
        }),
        createAudioFeatures("missing", {
          liveness: null,
          instrumentalness: null,
        }),
        { spotifyId: "failed", error: "Track not found" },
      ]),
    };
    const app = createTestApp({
      ...dependencies,
      trackAnalysisService: createTrackAnalysisService({
        audioFeaturesReader,
      }),
    });

    const response = await request(app)
      .post("/api/tracks/analysis")
      .send({ trackIds: ["measured", "missing", "failed"] })
      .expect(200);
    const stats = response.body.stats;

    expect(stats).toMatchObject({
      totalTracksCount: 3,
      foundTracksCount: 2,
      liveTrackPercentage: 100,
      instrumentalTrackPercentage: null,
      speechHeavyTrackPercentage: 0,
      measurementCounts: {
        mode: 2,
        liveness: 1,
        instrumentalness: 0,
        speechiness: 2,
      },
    });
    expect(
      audioFeaturesReader.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledOnce();
  });

  it("requires authorization before calling route dependencies", async () => {
    const dependencies = createRouteDependencies();
    dependencies.authorize = (_request, response) => {
      response.status(401).json({
        error: {
          code: "SPOTIFY_AUTH_REQUIRED",
          message: "Zaloguj się przez Spotify",
        },
      });
    };
    const app = createTestApp(dependencies);

    await request(app).get("/api/tracks/spotify-1/audio-features").expect(401);
    await request(app)
      .post("/api/tracks/analysis")
      .send({ trackIds: ["spotify-1"] })
      .expect(401);
    await request(app)
      .post("/api/tracks/statistics")
      .send({ audioFeatures: [] })
      .expect(401);

    expect(dependencies.getSoundchartsAudioFeatures).not.toHaveBeenCalled();
    expect(
      dependencies.trackAnalysisService.getTracksAnalysis
    ).not.toHaveBeenCalled();
  });

  it("returns Soundcharts audio features for the requested Spotify track", async () => {
    const dependencies = createRouteDependencies();
    const audioFeatures = { tempo: 124, energy: 0.8 };
    dependencies.getSoundchartsAudioFeatures.mockResolvedValue(audioFeatures);
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/tracks/spotify-123/audio-features")
      .expect(200);

    expect(response.body).toEqual(audioFeatures);
    expect(dependencies.getSoundchartsAudioFeatures).toHaveBeenCalledWith(
      "spotify-123"
    );
  });

  it("validates track IDs before calling ReccoBeats", async () => {
    const dependencies = createRouteDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/tracks/analysis")
      .send({ trackIds: [] })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "trackIds musi być niepustą tablicą",
      },
    });
    expect(
      dependencies.trackAnalysisService.getTracksAnalysis
    ).not.toHaveBeenCalled();
  });

  it("returns a combined analysis of audio features and statistics", async () => {
    const dependencies = createRouteDependencies();
    const results: TrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify-1"),
      { spotifyId: "spotify-2", error: "Track not found" },
    ];
    dependencies.trackAnalysisService.getTracksAnalysis.mockResolvedValue({
      stats: {
        trackCount: 1,
        averageBpm: 120,
        averageEnergy: 0.8,
        averageDanceability: 0.7,
        averageValence: 0.65,
        averageAcousticness: 0.2,
        averageInstrumentalness: 0.1,
        averageLiveness: 0.15,
        averageSpeechiness: 0.05,
        averageLoudness: -5,
        dominantKey: 2,
        dominantMode: 1,
        dominantTimeSignature: 4,
        majorPercentage: 100,
        minorPercentage: 0,
        liveTrackPercentage: 0,
        instrumentalTrackPercentage: 0,
        speechHeavyTrackPercentage: 0,
        measurementCounts: {
          mode: 1,
          liveness: 1,
          instrumentalness: 1,
          speechiness: 1,
        },
        totalTracksCount: 2,
        foundTracksCount: 1,
      },
      audioFeatures: results,
    });
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/tracks/analysis")
      .send({ trackIds: [" spotify-1 ", "spotify-2"] })
      .expect(200);

    expect(response.body).toMatchObject({
      stats: {
        trackCount: 1,
        averageBpm: 120,
        foundTracksCount: 1,
        totalTracksCount: 2,
      },
      audioFeatures: results,
    });
    expect(
      dependencies.trackAnalysisService.getTracksAnalysis
    ).toHaveBeenCalledWith(["spotify-1", "spotify-2"]);
  });

  it("maps a ReccoBeats failure to Bad Gateway", async () => {
    const dependencies = createRouteDependencies();
    const apiError = new ReccoBeatsApiError("ReccoBeats unavailable", 530, {
      error_code: 1033,
    });
    dependencies.trackAnalysisService.getTracksAnalysis.mockRejectedValue(
      apiError
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const app = createTestApp(dependencies);

    try {
      const response = await request(app)
        .post("/api/tracks/analysis")
        .send({ trackIds: ["spotify-1"] })
        .expect(502);

      expect(response.body).toEqual({
        error: {
          code: "RECCOBEATS_API_ERROR",
          message: "ReccoBeats unavailable",
          details: {
            integration: "reccobeats",
            upstreamStatus: 530,
          },
        },
      });
      expect(consoleError).toHaveBeenCalledWith(apiError);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each(["audio-features", "audio-stats"])(
    "does not expose the retired /%s endpoint",
    async (endpoint) => {
      const dependencies = createRouteDependencies();
      const app = createTestApp(dependencies);

      await request(app)
        .post(`/api/tracks/${endpoint}`)
        .send({ trackIds: ["spotify-1"] })
        .expect(404);

      expect(
        dependencies.trackAnalysisService.getTracksAnalysis
      ).not.toHaveBeenCalled();
    }
  );
});

function createRouteDependencies() {
  const authorize: RequestHandler = (_request, _response, next) => next();

  return {
    trackAnalysisService: {
      getTracksAnalysis: vi.fn(),
    },
    getSoundchartsAudioFeatures:
      vi.fn<(spotifyTrackId: string) => Promise<unknown>>(),
    authorize,
  };
}

function createTestApp(dependencies: Parameters<typeof createTrackRouter>[0]) {
  const app = express();

  app.use(express.json());
  app.use("/api/tracks", createTrackRouter(dependencies));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<TrackAudioFeatures> = {}
): TrackAudioFeatures {
  return {
    id: `recco-${spotifyId}`,
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
