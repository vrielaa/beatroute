import express from "express";
import session from "express-session";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPlaylistSaveService } from "@application/playlist-generator/playlist-save.service.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { errorHandler } from "@http/error-handler.js";
import { createPlaylistGeneratorRouter } from "./routes.js";

const endpoint = "/api/playlist-generator/resume-save";
const playlistId = "p".repeat(22);
const trackIds = Array.from({ length: 132 }, (_, index) =>
  String(index).padStart(22, "0")
);

describe("POST /api/playlist-generator/resume-save", () => {
  it("requires a Spotify session before reading or writing", async () => {
    const { app, gateway } = createTestApp();
    await request(app).post(endpoint).send({ playlistId }).expect(401);
    expect(gateway.getPlaylistContents).not.toHaveBeenCalled();
    expect(gateway.addTracksToPlaylist).not.toHaveBeenCalled();
  });

  it("retains the original selection and resumes only the remaining suffix", async () => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    const before = await browser.get("/test/session").expect(200);
    expect(before.body.pendingPlaylistSave.trackIds).toEqual(trackIds);

    const response = await browser
      .post(endpoint)
      .send({
        playlistId,
        trackIds: ["x".repeat(22)],
        name: "Changed",
        accessToken: "body-token",
      })
      .expect(200);

    expect(response.body).toEqual({
      id: playlistId,
      name: "Playlist",
      spotifyUrl: `https://open.spotify.com/playlist/${playlistId}`,
      trackCount: 132,
    });
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.getPlaylistContents).toHaveBeenCalledExactlyOnceWith(
      "session-token",
      playlistId
    );
    expect(gateway.addTracksToPlaylist).toHaveBeenLastCalledWith(
      "session-token",
      playlistId,
      trackIds.slice(100)
    );
    expect(
      (await browser.get("/test/session")).body.pendingPlaylistSave
    ).toBeUndefined();
    await browser.post(endpoint).send({ playlistId }).expect(409);
    expect(gateway.getPlaylistContents).toHaveBeenCalledOnce();
  });

  it("does not duplicate the last batch if Spotify wrote it before the response was lost", async () => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    gateway.getPlaylistContents.mockResolvedValue({
      trackIds,
      snapshotId: "snapshot",
    });

    await browser.post(endpoint).send({ playlistId }).expect(200);

    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledTimes(2);
  });

  it.each([
    "playlist-modify-private",
    "playlist-read-private",
    "playlist-modify-private playlist-read-private-extra",
  ])("requires both exact scopes, not %s", async (scope) => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    await login(browser, scope);

    await browser
      .post(endpoint)
      .send({
        playlistId,
        scope: "playlist-modify-private playlist-read-private",
      })
      .expect(403);

    expect(gateway.getPlaylistContents).not.toHaveBeenCalled();
  });

  it("rejects an ID belonging to a different pending save or browser session", async () => {
    const { browser, app, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    await browser
      .post(endpoint)
      .send({ playlistId: "q".repeat(22) })
      .expect(409);
    const otherBrowser = request.agent(app);
    await login(otherBrowser);
    await otherBrowser.post(endpoint).send({ playlistId }).expect(409);
    expect(gateway.getPlaylistContents).not.toHaveBeenCalled();
  });

  it("keeps pending progress after a read failure and forwards Retry-After", async () => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    gateway.getPlaylistContents.mockRejectedValueOnce(
      new SpotifyApiError("Rate limit", 429, null, { retryAfterSeconds: 120 })
    );

    await browser
      .post(endpoint)
      .send({ playlistId })
      .expect(429)
      .expect("Retry-After", "120");
    expect(
      (await browser.get("/test/session")).body.pendingPlaylistSave.progress
        .confirmedTrackCount
    ).toBe(100);
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    await browser.post(endpoint).send({ playlistId }).expect(200);
  });

  it("maps changed contents to 409 without writing or losing the saved selection", async () => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    gateway.getPlaylistContents.mockResolvedValue({
      trackIds: ["x".repeat(22)],
      snapshotId: "snapshot",
    });

    const response = await browser
      .post(endpoint)
      .send({ playlistId })
      .expect(409);

    expect(response.body.error.code).toBe("PLAYLIST_CONTENTS_CHANGED");
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledTimes(2);
    expect(
      (await browser.get("/test/session")).body.pendingPlaylistSave.trackIds
    ).toEqual(trackIds);
  });

  it("retains the same playlist and original IDs after another partial failure", async () => {
    const { browser, gateway } = createTestApp();
    await login(browser);
    await failSave(browser, gateway);
    gateway.addTracksToPlaylist.mockRejectedValueOnce(
      new SpotifyApiError("Limit", 429)
    );

    const response = await browser
      .post(endpoint)
      .send({ playlistId })
      .expect(429);

    expect(response.body.error.code).toBe("PLAYLIST_SAVE_INCOMPLETE");
    expect(response.body.error.details.progress.id).toBe(playlistId);
    expect(
      (await browser.get("/test/session")).body.pendingPlaylistSave.trackIds
    ).toEqual(trackIds);
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    await browser.post(endpoint).send({ playlistId }).expect(200);
  });

  it.each([{}, { playlistId: "bad" }, { playlistId: [playlistId] }])(
    "rejects malformed resume data %j",
    async (body) => {
      const { browser, gateway } = createTestApp();
      await login(browser);
      await browser.post(endpoint).send(body).expect(400);
      expect(gateway.getPlaylistContents).not.toHaveBeenCalled();
    }
  );
});

function createTestApp() {
  const gateway = {
    createPlaylist: vi.fn().mockResolvedValue({
      id: playlistId,
      name: "Playlist",
      external_urls: {
        spotify: `https://open.spotify.com/playlist/${playlistId}`,
      },
    }),
    addTracksToPlaylist: vi.fn().mockResolvedValue(undefined),
    getPlaylistContents: vi.fn().mockResolvedValue({
      trackIds: trackIds.slice(0, 100),
      snapshotId: "snapshot",
    }),
  };
  const service = createPlaylistSaveService(gateway);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      secret: "resume-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post("/test/login", (req, res) => {
    req.session.spotify = {
      accessToken: "session-token",
      refreshToken: "refresh-token",
      expiresAt: 4_000_000,
      scope: req.body.scope,
      tokenType: "Bearer",
    };
    res.sendStatus(204);
  });
  app.get("/test/session", (req, res) =>
    res.json({ pendingPlaylistSave: req.session.pendingPlaylistSave })
  );
  app.use(
    "/api/playlist-generator",
    createPlaylistGeneratorRouter({
      prepareDataset: vi.fn(),
      prepareSavedTracksPage: vi.fn(),
      savePlaylist: service.savePlaylist,
      resumePlaylist: service.resumePlaylist,
      authorize: createEnsureSpotifyAccessToken({
        now: () => 1_000_000,
        refresh: vi.fn(),
      }),
    })
  );
  app.use(errorHandler);
  return { app, browser: request.agent(app), gateway };
}

async function login(
  browser: ReturnType<typeof request.agent>,
  scope = "playlist-modify-private playlist-read-private"
) {
  await browser.post("/test/login").send({ scope }).expect(204);
}

async function failSave(
  browser: ReturnType<typeof request.agent>,
  gateway: ReturnType<typeof createTestApp>["gateway"]
) {
  gateway.addTracksToPlaylist
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new SpotifyApiError("Limit", 429));
  await browser
    .post("/api/playlist-generator/save")
    .send({ name: "Playlist", trackIds })
    .expect(429);
}
