import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-handler.js";
import { LastfmApiError } from "@integrations/lastfm/lastfm-api.error.js";
import { createLastfmRouter } from "./routes.js";
import type { LastfmRouterDependencies } from "./routes.js";
import type { RequestHandler } from "express";
import type { SessionData } from "express-session";
import type { LastfmTrackInfo } from "@application/lastfm/types.js";

describe("Last.fm routes", () => {
  it("returns the connected user profile after Last.fm authorization", async () => {
    const dependencies = createDependencies();
    const profile = {
      name: "lastfm-user",
      url: "https://last.fm/user/lastfm-user",
      image: "image",
    };
    dependencies.getUserInfo.mockResolvedValue(profile);
    const app = createTestApp(dependencies, {
      lastfm: { sessionKey: "key", username: "lastfm-user" },
    });

    await request(app).get("/api/lastfm/me").expect(200, profile);

    expect(dependencies.authorizeLastfm).toHaveBeenCalledOnce();
    expect(dependencies.getUserInfo).toHaveBeenCalledWith("lastfm-user");
    expect(dependencies.authorizeSpotify).not.toHaveBeenCalled();
  });

  it("rejects a missing Last.fm session before fetching the profile", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app).get("/api/lastfm/me").expect(401);

    expect(response.body.error.code).toBe("LASTFM_AUTH_REQUIRED");
    expect(dependencies.getUserInfo).not.toHaveBeenCalled();
  });

  it("validates a public track identifier and returns its metadata", async () => {
    const dependencies = createDependencies();
    const trackInfo = createTrackInfo();
    dependencies.getTrackInfo.mockResolvedValue(trackInfo);
    const app = createTestApp(dependencies);

    await request(app)
      .get("/api/lastfm/track-info")
      .query({ artist: " Cher ", track: " Believe " })
      .expect(200, trackInfo);

    expect(dependencies.getTrackInfo).toHaveBeenCalledWith({
      artist: "Cher",
      track: "Believe",
    });
    expect(dependencies.authorizeSpotify).not.toHaveBeenCalled();
    expect(dependencies.authorizeLastfm).not.toHaveBeenCalled();
  });

  it("forwards an MBID instead of artist and track names", async () => {
    const dependencies = createDependencies();
    dependencies.getTrackInfo.mockResolvedValue(createTrackInfo());
    const app = createTestApp(dependencies);

    await request(app)
      .get("/api/lastfm/track-info")
      .query({ mbid: " track-mbid ", artist: "Cher", track: "Believe" })
      .expect(200);

    expect(dependencies.getTrackInfo).toHaveBeenCalledWith({
      mbid: "track-mbid",
    });
  });

  it("rejects an incomplete track identifier before fetching metadata", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/lastfm/track-info")
      .query({ artist: "Cher" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.getTrackInfo).not.toHaveBeenCalled();
  });

  it("authorizes and validates artist names before returning their distribution", async () => {
    const dependencies = createDependencies();
    const distribution: Awaited<
      ReturnType<LastfmRouterDependencies["getGenreDistribution"]>
    > = {
      source: "lastfm-artist-info-tags",
      totalArtists: 1,
      matchedArtists: 0,
      totalGenreMatches: 0,
      unmatchedArtists: ["Radiohead"],
      genres: [],
    };
    dependencies.getGenreDistribution.mockResolvedValue(distribution);
    const app = createTestApp(dependencies);

    await request(app)
      .post("/api/lastfm/artist-genres")
      .send({ artists: [" Radiohead "] })
      .expect(200, distribution);

    expect(dependencies.authorizeSpotify).toHaveBeenCalledOnce();
    expect(dependencies.getGenreDistribution).toHaveBeenCalledWith([
      "Radiohead",
    ]);
  });

  it("rejects invalid artist names before calling the application operation", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .post("/api/lastfm/artist-genres")
      .send({ artists: [] })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.getGenreDistribution).not.toHaveBeenCalled();
  });

  it("forwards the Spotify track ID and session token and returns the combined profile", async () => {
    const dependencies = createDependencies();
    const profile: Awaited<
      ReturnType<LastfmRouterDependencies["getSpotifyTrackInfo"]>
    > = {
      spotify: {
        id: "spotify-track",
        name: "Believe",
        artists: ["Cher"],
        album: null,
        durationMs: null,
        spotifyUrl: null,
      },
      lastfm: createTrackInfo(),
    };
    dependencies.getSpotifyTrackInfo.mockResolvedValue(profile);
    const app = createTestApp(dependencies, {
      spotify: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3_600_000,
        scope: "user-top-read",
        tokenType: "Bearer",
      },
    });

    await request(app)
      .get("/api/lastfm/spotify-tracks/spotify-track")
      .expect(200, profile);

    expect(dependencies.authorizeSpotify).toHaveBeenCalledOnce();
    expect(dependencies.getSpotifyTrackInfo).toHaveBeenCalledWith({
      spotifyTrackId: "spotify-track",
      accessToken: "access-token",
    });
  });

  it("rejects a missing Spotify session before building the track profile", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/lastfm/spotify-tracks/spotify-track")
      .expect(401);

    expect(response.body.error.code).toBe("SPOTIFY_AUTH_REQUIRED");
    expect(dependencies.getSpotifyTrackInfo).not.toHaveBeenCalled();
  });

  it("does not call protected operations when authorization stops the request", async () => {
    const dependencies = createDependencies();
    const deny: RequestHandler = (_req, res) => {
      res.sendStatus(401);
    };
    dependencies.authorizeLastfm.mockImplementation(deny);
    dependencies.authorizeSpotify.mockImplementation(deny);
    const app = createTestApp(dependencies);

    await request(app).get("/api/lastfm/me").expect(401);
    await request(app)
      .post("/api/lastfm/artist-genres")
      .send({ artists: ["Radiohead"] })
      .expect(401);
    await request(app)
      .get("/api/lastfm/spotify-tracks/spotify-track")
      .expect(401);

    expect(dependencies.getUserInfo).not.toHaveBeenCalled();
    expect(dependencies.getGenreDistribution).not.toHaveBeenCalled();
    expect(dependencies.getSpotifyTrackInfo).not.toHaveBeenCalled();
  });

  it("passes operation errors to the central HTTP error handler", async () => {
    const dependencies = createDependencies();
    dependencies.getTrackInfo.mockRejectedValue(
      new LastfmApiError("Limit zapytań Last.fm", 29, { retryAfterSeconds: 5 })
    );
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/lastfm/track-info")
      .query({ artist: "Cher", track: "Believe" })
      .expect(429);

    expect(response.headers["retry-after"]).toBe("5");
    expect(response.body.error).toMatchObject({
      code: "LASTFM_API_ERROR",
      details: {
        integration: "lastfm",
        upstreamCode: 29,
        retryAfterSeconds: 5,
      },
    });
  });
});

function createDependencies() {
  return {
    authorizeLastfm: vi.fn<RequestHandler>((_req, _res, next) => next()),
    authorizeSpotify: vi.fn<RequestHandler>((_req, _res, next) => next()),
    getUserInfo: vi.fn<LastfmRouterDependencies["getUserInfo"]>(),
    getTrackInfo: vi.fn<LastfmRouterDependencies["getTrackInfo"]>(),
    getGenreDistribution:
      vi.fn<LastfmRouterDependencies["getGenreDistribution"]>(),
    getSpotifyTrackInfo:
      vi.fn<LastfmRouterDependencies["getSpotifyTrackInfo"]>(),
  };
}

function createTrackInfo(): LastfmTrackInfo {
  return {
    name: "Believe",
    artist: "Cher",
    mbid: null,
    url: null,
    tags: [],
    genre: null,
    genreCandidates: [],
    genreSource: null,
    genreIsFallback: false,
  };
}

function createTestApp(
  dependencies: LastfmRouterDependencies,
  sessionData: Pick<SessionData, "lastfm" | "spotify"> = {}
) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "lastfm-route-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, _res, next) => {
    Object.assign(req.session, sessionData);
    next();
  });
  app.use("/api/lastfm", createLastfmRouter(dependencies));
  app.use(errorHandler);
  return app;
}
