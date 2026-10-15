import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestHandler } from "express";
import { createMeRouter } from "./routes.js";
import { createTrackRouter } from "../tracks/routes.js";
import { errorHandler } from "@http/error-handler.js";
import { createSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import { createReccoBeatsGateway } from "@integrations/reccobeats/reccobeats.gateway.js";
import { createReccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { createTopTracksService } from "@application/tracks/top-tracks.service.js";
import { createTrackAnalysisService } from "@application/tracks/track-analysis.service.js";

afterEach(() => vi.restoreAllMocks());

describe("top-track preparation through real routers and services", () => {
  it("fills 7/10 → 9/10 → 10/10, then summarizes preserved measurements without additional provider calls", async () => {
    const { app, spotifyFetch, reccoFetch } = setup();
    const browser = request.agent(app);
    const first = await browser
      .get("/api/me/top-tracks/dataset")
      .query({ limit: 10, offset: 0, time_range: "short_term" })
      .expect(200);
    const second = await browser
      .get("/api/me/top-tracks/dataset")
      .query({ limit: 3, offset: 10, time_range: "short_term" })
      .expect(200);
    const third = await browser
      .get("/api/me/top-tracks/dataset")
      .query({ limit: 1, offset: 13, time_range: "short_term" })
      .expect(200);
    expect([
      first.body.tracks.length,
      second.body.tracks.length,
      third.body.tracks.length,
    ]).toEqual([7, 2, 1]);
    expect(
      first.body.skippedItems +
        second.body.skippedItems +
        third.body.skippedItems
    ).toBe(4);
    expect([
      first.body.nextOffset,
      second.body.nextOffset,
      third.body.nextOffset,
    ]).toEqual([10, 13, null]);
    const audioFeatures = [
      ...first.body.audioFeatures,
      ...second.body.audioFeatures,
      ...third.body.audioFeatures,
    ];
    const calls = reccoFetch.mock.calls.length;
    const summary = await browser
      .post("/api/tracks/statistics")
      .send({ audioFeatures })
      .expect(200);
    expect(summary.body).toMatchObject({
      foundTracksCount: 10,
      trackCount: 10,
      totalTracksCount: 10,
      averageBpm: 120,
    });
    expect(reccoFetch).toHaveBeenCalledTimes(calls);
    expect(spotifyFetch).toHaveBeenCalledTimes(3);
    for (const call of spotifyFetch.mock.calls) {
      expect(new URL(String(call[0])).searchParams.get("time_range")).toBe(
        "short_term"
      );
      expect(new URL(String(call[0])).pathname).toBe("/v1/me/top/tracks");
    }
  });

  it("retains a technical partial failure and Retry-After instead of reporting missing tracks", async () => {
    const { app } = setup(429);
    const response = await request(app)
      .get("/api/me/top-tracks/dataset")
      .query({ limit: 10 })
      .expect(429);
    expect(response.headers["retry-after"]).toBe("45");
    expect(response.body.error.details).toMatchObject({
      integration: "reccobeats",
      retryAfterSeconds: 45,
    });
    expect(response.body).not.toHaveProperty("skippedItems");
    expect(response.body).not.toHaveProperty("tracks");
  });

  it("does not classify partial measurements as complete music-map vectors", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/api/me/top-tracks/dataset")
      .query({ limit: 10, purpose: "music-map" })
      .expect(200);
    expect(response.body).toMatchObject({
      tracks: [],
      skippedItems: 10,
      processedItems: 10,
      nextOffset: 10,
    });
  });
});

function setup(failureStatus?: number) {
  const tracks = Array.from({ length: 14 }, (_, index) => ({
    id: id(index),
    name: `Track ${index}`,
    artists: [{ name: "Artist" }],
    album: { name: "Album", artists: [], images: [] },
    duration_ms: 1000,
    track_number: 1,
    external_urls: {},
  }));
  const missingIds = new Set([id(7), id(8), id(9), id(12)]);
  const spotifyFetch = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      const items = tracks.slice(offset, offset + limit);
      return json({
        items,
        limit,
        offset,
        total: tracks.length,
        href: url.toString(),
        previous: null,
        next:
          offset + items.length < tracks.length
            ? "https://spotify.test/next"
            : null,
      });
    });
  const reccoFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/track") {
      return json(
        url.searchParams
          .getAll("ids")
          .filter((trackId) => !missingIds.has(trackId))
          .map((trackId) => ({
            id: trackId,
            href: `https://open.spotify.com/track/${trackId}`,
            trackTitle: "Track",
          }))
      );
    }
    if (failureStatus && url.pathname.includes(id(0))) {
      return new Response(JSON.stringify({ error: "Unavailable" }), {
        status: failureStatus,
        headers: { "Retry-After": "45", "Content-Type": "application/json" },
      });
    }
    return json({ tempo: 120, energy: 0 });
  });
  const spotifyGateway = createSpotifyGateway({
    fetchImpl: spotifyFetch,
    apiRoot: "https://spotify.test/v1",
  });
  const audioFeaturesReader = createReccoBeatsService({
    reccoBeatsGateway: createReccoBeatsGateway({
      fetchImpl: reccoFetch,
      baseUrl: "https://recco.test",
      requestPolicy: { maxAttempts: 1 },
    }),
  });
  const authorize: RequestHandler = (req, _res, next) => {
    req.session.spotify = {
      accessToken: "test-token",
      refreshToken: "test-refresh",
      expiresAt: Date.now() + 60000,
      scope: "user-top-read",
      tokenType: "Bearer",
    };
    next();
  };
  const app = express();
  app.use(
    session({
      secret: "test-top-tracks-secret",
      saveUninitialized: false,
      resave: false,
    })
  );
  app.use(express.json());
  app.use(
    "/api/me",
    createMeRouter({
      authorize,
      spotifyGateway,
      topTracksService: createTopTracksService({
        spotifyGateway,
        audioFeaturesReader,
      }),
    })
  );
  app.use(
    "/api/tracks",
    createTrackRouter({
      authorize,
      trackAnalysisService: createTrackAnalysisService({ audioFeaturesReader }),
      getSoundchartsAudioFeatures: vi.fn(),
    })
  );
  app.use(errorHandler);
  return { app, spotifyFetch, reccoFetch };
}
function id(index: number): string {
  return String(index).padStart(22, "0");
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
