import { describe, expect, it, vi } from "vitest";

import { HttpError } from "@http/error-response.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import { createLastfmController } from "./lastfm.controller.js";
import type { Request, Response } from "express";

describe("Last.fm controller", () => {
  it("returns the connected Last.fm user profile", async () => {
    const dependencies = createDependencies();
    dependencies.getUserInfo.mockResolvedValue({
      name: "lastfm-user",
      url: "https://last.fm/user/lastfm-user",
      image: "image",
    });
    const controller = createLastfmController(dependencies);
    const response = createResponse();

    await controller.getLastfmMe(
      createRequest({ lastfm: { sessionKey: "key", username: "lastfm-user" } }),
      response
    );

    expect(dependencies.getUserInfo).toHaveBeenCalledWith("lastfm-user");
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ name: "lastfm-user" })
    );
  });

  it("defensively rejects a missing Last.fm session", async () => {
    const controller = createLastfmController(createDependencies());

    await expect(
      controller.getLastfmMe(createRequest(), createResponse())
    ).rejects.toMatchObject({
      code: "LASTFM_AUTH_REQUIRED",
      status: 401,
    });
  });

  it("validates and forwards a track identifier", async () => {
    const dependencies = createDependencies();
    dependencies.getTrackInfo.mockResolvedValue({ name: "Believe" });
    const controller = createLastfmController(dependencies);
    const request = createRequest();
    request.query = { artist: " Cher ", track: " Believe " };
    const response = createResponse();

    await controller.getLastfmTrackInfo(request, response);

    expect(dependencies.getTrackInfo).toHaveBeenCalledWith({
      artist: "Cher",
      track: "Believe",
    });
    expect(response.json).toHaveBeenCalledWith({ name: "Believe" });
  });

  it("rejects invalid artist genre payloads before calling the service", async () => {
    const dependencies = createDependencies();
    const controller = createLastfmController(dependencies);
    const request = createRequest();
    request.body = { artists: [] };

    await expect(
      controller.getArtistGenreDistribution(request, createResponse())
    ).rejects.toBeInstanceOf(RequestValidationError);
    expect(dependencies.getGenreDistribution).not.toHaveBeenCalled();
  });

  it("forwards Spotify track and session identifiers to the use case", async () => {
    const dependencies = createDependencies();
    dependencies.getSpotifyTrackInfo.mockResolvedValue({
      spotify: {},
      lastfm: {},
    });
    const controller = createLastfmController(dependencies);
    const request = createRequest({
      spotify: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 1,
        scope: "scope",
        tokenType: "Bearer",
      },
    }) as Request<{ spotifyTrackId: string }>;
    request.params = { spotifyTrackId: "spotify-track" };

    await controller.getSpotifyTrackLastfmInfo(request, createResponse());

    expect(dependencies.getSpotifyTrackInfo).toHaveBeenCalledWith({
      spotifyTrackId: "spotify-track",
      accessToken: "access-token",
    });
  });

  it("defensively rejects a missing Spotify session", async () => {
    const controller = createLastfmController(createDependencies());
    const request = createRequest() as Request<{ spotifyTrackId: string }>;
    request.params = { spotifyTrackId: "spotify-track" };

    const promise = controller.getSpotifyTrackLastfmInfo(
      request,
      createResponse()
    );

    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toMatchObject({
      code: "SPOTIFY_AUTH_REQUIRED",
    });
  });
});

function createDependencies() {
  return {
    getUserInfo: vi.fn(),
    getTrackInfo: vi.fn(),
    getGenreDistribution: vi.fn(),
    getSpotifyTrackInfo: vi.fn(),
  } as unknown as Parameters<typeof createLastfmController>[0] & {
    getUserInfo: ReturnType<typeof vi.fn>;
    getTrackInfo: ReturnType<typeof vi.fn>;
    getGenreDistribution: ReturnType<typeof vi.fn>;
    getSpotifyTrackInfo: ReturnType<typeof vi.fn>;
  };
}

function createRequest(sessionData: Record<string, unknown> = {}): Request {
  return {
    session: sessionData,
    query: {},
    body: {},
    params: {},
  } as unknown as Request;
}

function createResponse(): Response {
  const response = { json: vi.fn() };
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}
