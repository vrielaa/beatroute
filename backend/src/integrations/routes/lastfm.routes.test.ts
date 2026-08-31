import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { createLastfmRouter } from "./lastfm.routes.js";
import type { RequestHandler } from "express";

describe("Last.fm routes", () => {
  it("mounts the profile endpoint behind Last.fm authorization", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    await request(app).get("/api/lastfm/me").expect(200, { route: "me" });
    expect(dependencies.authorizeLastfm).toHaveBeenCalledOnce();
    expect(dependencies.handlers.getLastfmMe).toHaveBeenCalledOnce();
  });

  it("mounts public track info without Spotify authorization", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    await request(app)
      .get("/api/lastfm/track-info")
      .expect(200, { route: "track-info" });
    expect(dependencies.authorizeSpotify).not.toHaveBeenCalled();
    expect(dependencies.handlers.getLastfmTrackInfo).toHaveBeenCalledOnce();
  });

  it("protects artist genres and Spotify track routes with Spotify authorization", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    await request(app)
      .post("/api/lastfm/artist-genres")
      .expect(200, { route: "genres" });
    await request(app).get("/api/lastfm/spotify-tracks/track-id").expect(200, {
      route: "spotify-track",
    });

    expect(dependencies.authorizeSpotify).toHaveBeenCalledTimes(2);
    expect(
      dependencies.handlers.getArtistGenreDistribution
    ).toHaveBeenCalledOnce();
    expect(
      dependencies.handlers.getSpotifyTrackLastfmInfo
    ).toHaveBeenCalledOnce();
  });
});

function createDependencies() {
  const pass: RequestHandler = vi.fn((_req, _res, next) => next());

  return {
    authorizeLastfm: pass,
    authorizeSpotify: pass,
    handlers: {
      getLastfmMe: vi.fn((_req, res) => res.json({ route: "me" })),
      getLastfmTrackInfo: vi.fn((_req, res) =>
        res.json({ route: "track-info" })
      ),
      getArtistGenreDistribution: vi.fn((_req, res) =>
        res.json({ route: "genres" })
      ),
      getSpotifyTrackLastfmInfo: vi.fn((_req, res) =>
        res.json({ route: "spotify-track" })
      ),
    },
  } as unknown as Parameters<typeof createLastfmRouter>[0] & {
    authorizeLastfm: ReturnType<typeof vi.fn>;
    authorizeSpotify: ReturnType<typeof vi.fn>;
    handlers: Record<string, ReturnType<typeof vi.fn>>;
  };
}

function createTestApp(dependencies: Parameters<typeof createLastfmRouter>[0]) {
  const app = express();
  app.use("/api/lastfm", createLastfmRouter(dependencies));
  app.use(errorHandler);
  return app;
}
