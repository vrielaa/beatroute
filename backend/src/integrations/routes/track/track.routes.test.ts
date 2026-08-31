import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { ReccoBeatsApiError } from "../../reccobeats/reccobeats-api.error.js";
import { createTrackRouter } from "./track.routes.js";
import type { RequestHandler } from "express";
import type {
  ReccoBeatsTrackAudioFeatures,
  ReccoBeatsTrackAudioFeaturesResult,
} from "../../reccobeats/reccobeats.types.js";

describe("track routes", () => {
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
      .post("/api/tracks/audio-features")
      .send({ trackIds: ["spotify-1"] })
      .expect(401);
    await request(app)
      .post("/api/tracks/audio-stats")
      .send({ trackIds: ["spotify-1"] })
      .expect(401);

    expect(dependencies.getSoundchartsAudioFeatures).not.toHaveBeenCalled();
    expect(
      dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds
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
      .post("/api/tracks/audio-features")
      .send({ trackIds: [] })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "trackIds musi być niepustą tablicą",
      },
    });
    expect(
      dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds
    ).not.toHaveBeenCalled();
  });

  it("returns a separate ReccoBeats result for every requested track", async () => {
    const dependencies = createRouteDependencies();
    const results: ReccoBeatsTrackAudioFeaturesResult[] = [
      createAudioFeatures("spotify-1"),
      { spotifyId: "spotify-2", error: "Track not found" },
    ];
    dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      results
    );
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/tracks/audio-features")
      .send({ trackIds: [" spotify-1 ", "spotify-2"] })
      .expect(200);

    expect(response.body).toEqual({ audio_features: results });
    expect(
      dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds
    ).toHaveBeenCalledWith(["spotify-1", "spotify-2"]);
  });

  it("calculates statistics and reports requested and found track counts", async () => {
    const dependencies = createRouteDependencies();
    dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds.mockResolvedValue(
      [
        createAudioFeatures("spotify-1", { tempo: 120 }),
        { spotifyId: "spotify-2", error: "Track not found" },
      ]
    );
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/tracks/audio-stats")
      .send({ trackIds: ["spotify-1", "spotify-2"] })
      .expect(200);

    expect(response.body).toMatchObject({
      trackCount: 1,
      averageBpm: 120,
      foundTracksCount: 1,
      totalTracksCount: 2,
    });
  });

  it("maps a ReccoBeats failure to Bad Gateway", async () => {
    const dependencies = createRouteDependencies();
    const apiError = new ReccoBeatsApiError("ReccoBeats unavailable", 530, {
      error_code: 1033,
    });
    dependencies.reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds.mockRejectedValue(
      apiError
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const app = createTestApp(dependencies);

    try {
      const response = await request(app)
        .post("/api/tracks/audio-features")
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
});

function createRouteDependencies() {
  const authorize: RequestHandler = (_request, _response, next) => next();

  return {
    reccoBeatsService: {
      getManyTrackAudioFeaturesBySpotifyIds:
        vi.fn<
          (
            spotifyIds: string[]
          ) => Promise<ReccoBeatsTrackAudioFeaturesResult[]>
        >(),
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
  app.use(errorHandler);

  return app;
}

function createAudioFeatures(
  spotifyId: string,
  overrides: Partial<ReccoBeatsTrackAudioFeatures> = {}
): ReccoBeatsTrackAudioFeatures {
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
