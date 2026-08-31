import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "@http/error-response.js";
import { createMeRouter } from "./routes.js";
import type { RequestHandler } from "express";
import type {
  SpotifyGateway,
  SpotifyPage,
  SpotifyTrackApiResponse,
  SpotifyArtistApiResponse,
  SpotifyUserProfileApiResponse,
} from "../../spotify/spotify.types.js";

describe("me routes", () => {
  it("requires Spotify authorization before calling the gateway", async () => {
    const dependencies = createRouteDependencies();
    dependencies.authorize = (_request, response) => {
      response.status(401).json({
        error: {
          code: "SPOTIFY_AUTH_REQUIRED",
          message: "Użytkownik nie jest zalogowany do Spotify",
        },
      });
    };
    const app = createTestApp(dependencies);

    await request(app).get("/api/me/profile").expect(401);
    await request(app).get("/api/me/top-tracks").expect(401);
    await request(app).get("/api/me/top-artists").expect(401);

    expect(
      dependencies.spotifyGateway.getCurrentUserProfile
    ).not.toHaveBeenCalled();
    expect(
      dependencies.spotifyGateway.getCurrentUserTopTracks
    ).not.toHaveBeenCalled();
    expect(
      dependencies.spotifyGateway.getCurrentUserTopArtists
    ).not.toHaveBeenCalled();
  });

  it("returns the profile of the authenticated Spotify user", async () => {
    const dependencies = createRouteDependencies();
    const profile: SpotifyUserProfileApiResponse = {
      id: "spotify-user",
      display_name: "Name",
    };
    dependencies.spotifyGateway.getCurrentUserProfile.mockResolvedValue(
      profile
    );
    const app = createTestApp(dependencies);

    const response = await request(app).get("/api/me/profile").expect(200);

    expect(response.body).toEqual(profile);
    expect(
      dependencies.spotifyGateway.getCurrentUserProfile
    ).toHaveBeenCalledWith("access-token");
  });

  it("passes the selected limit and time range to the top tracks gateway", async () => {
    const dependencies = createRouteDependencies();
    const topTracks = createSpotifyPage<SpotifyTrackApiResponse>(12);
    dependencies.spotifyGateway.getCurrentUserTopTracks.mockResolvedValue(
      topTracks
    );
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/me/top-tracks")
      .query({ limit: "12", time_range: "short_term" })
      .expect(200);

    expect(response.body).toEqual(topTracks);
    expect(
      dependencies.spotifyGateway.getCurrentUserTopTracks
    ).toHaveBeenCalledWith("access-token", {
      limit: 12,
      timeRange: "short_term",
    });
  });

  it("uses default selection values when requesting top artists", async () => {
    const dependencies = createRouteDependencies();
    const topArtists = createSpotifyPage<SpotifyArtistApiResponse>(10);
    dependencies.spotifyGateway.getCurrentUserTopArtists.mockResolvedValue(
      topArtists
    );
    const app = createTestApp(dependencies);

    const response = await request(app).get("/api/me/top-artists").expect(200);

    expect(response.body).toEqual(topArtists);
    expect(
      dependencies.spotifyGateway.getCurrentUserTopArtists
    ).toHaveBeenCalledWith("access-token", {
      limit: 10,
      timeRange: "medium_term",
    });
  });

  it("rejects an invalid limit before requesting top items", async () => {
    const dependencies = createRouteDependencies();
    const app = createTestApp(dependencies);

    const response = await request(app)
      .get("/api/me/top-tracks")
      .query({ limit: "41" })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: 'Parametr "limit" musi być liczbą całkowitą od 1 do 40',
      },
    });
    expect(
      dependencies.spotifyGateway.getCurrentUserTopTracks
    ).not.toHaveBeenCalled();
  });
});

function createRouteDependencies() {
  const authorize: RequestHandler = (request, _response, next) => {
    request.session.spotify = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-top-read user-read-private",
      tokenType: "Bearer",
    };
    next();
  };

  return {
    spotifyGateway: {
      getCurrentUserProfile: vi.fn<SpotifyGateway["getCurrentUserProfile"]>(),
      getCurrentUserTopTracks:
        vi.fn<SpotifyGateway["getCurrentUserTopTracks"]>(),
      getCurrentUserTopArtists:
        vi.fn<SpotifyGateway["getCurrentUserTopArtists"]>(),
    },
    authorize,
  };
}

function createTestApp(dependencies: Parameters<typeof createMeRouter>[0]) {
  const app = express();

  app.use(
    session({
      secret: "me-routes-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use("/api/me", createMeRouter(dependencies));
  app.use(errorHandler);

  return app;
}

function createSpotifyPage<T>(limit: number): SpotifyPage<T> {
  return {
    href: "https://api.spotify.com/v1/me/top/items",
    items: [],
    limit,
    next: null,
    offset: 0,
    previous: null,
    total: 0,
  };
}
