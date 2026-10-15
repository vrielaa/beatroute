import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaylistGeneratorRouter } from "./routes.js";
import { parsePlaylistSourceSelection } from "./playlist-source.validator.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { errorHandler } from "@http/error-handler.js";
import { PlaylistSourceChangedError } from "@application/playlist-generator/playlist-dataset.service.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";

const endpoint = "/api/playlist-generator/prepare-playlist";
const playlistId = "P".repeat(22);
const firstPage = { playlistId, offset: 0, snapshotId: null };
const preparedPage = {
  playlist: { id: playlistId, name: "Summer", snapshotId: "version-1" },
  preparedDataset: {
    dataset: { version: 1 as const, tracks: [] },
    skippedTracks: [],
    incompleteTracks: [],
  },
  pagination: { offset: 0, processedItems: 0, totalItems: 0, nextOffset: null },
  unavailableItemsCount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("playlist source validator", () => {
  it("trims only the ID and discards untrusted extra fields", () => {
    expect(
      parsePlaylistSourceSelection({
        ...firstPage,
        playlistId: ` ${playlistId} `,
        accessToken: "untrusted",
        owner: true,
      })
    ).toEqual(firstPage);
    expect(
      parsePlaylistSourceSelection({
        playlistId,
        offset: 499,
        snapshotId: " opaque version ",
      })
    ).toEqual({ playlistId, offset: 499, snapshotId: " opaque version " });
  });
});

describe("POST /api/playlist-generator/prepare-playlist", () => {
  it("requires authentication before validating or reading the source", async () => {
    const { app, deps } = setup();
    await request(app).post(endpoint).send({}).expect(401);
    expect(deps.preparePlaylistPage).not.toHaveBeenCalled();
  });

  it.each(["", "playlist-read-private-extra", "user-library-read"])(
    "requires the actual read permission: %s",
    async (scope) => {
      const { app, deps } = setup();
      const browser = request.agent(app);
      await browser.post("/test/login").send({ scope }).expect(204);
      const response = await browser.post(endpoint).send(firstPage).expect(403);
      expect(response.body.error.code).toBe(
        "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED"
      );
      expect(deps.preparePlaylistPage).not.toHaveBeenCalled();
    }
  );

  it("uses the session token and returns even an empty source unchanged", async () => {
    const { app, deps } = setup();
    const browser = request.agent(app);
    await browser
      .post("/test/login")
      .send({ scope: "user-top-read\tplaylist-read-private" })
      .expect(204);
    await browser
      .post(endpoint)
      .send({
        ...firstPage,
        accessToken: "body-token",
        userId: "other",
        limit: 500,
      })
      .expect(200, preparedPage);
    expect(deps.preparePlaylistPage).toHaveBeenCalledExactlyOnceWith(
      firstPage,
      "session-token"
    );
    expect(deps.prepareDataset).not.toHaveBeenCalled();
    expect(deps.savePlaylist).not.toHaveBeenCalled();
    expect(deps.resumePlaylist).not.toHaveBeenCalled();
  });

  it.each([
    {},
    [],
    null,
    { ...firstPage, playlistId: "" },
    { ...firstPage, playlistId: 123 },
    {
      ...firstPage,
      playlistId: `https://open.spotify.com/playlist/${playlistId}`,
    },
    { playlistId, offset: 0 },
    { ...firstPage, offset: "0" },
    { ...firstPage, offset: -1 },
    { ...firstPage, offset: 500 },
    { ...firstPage, offset: 0.5 },
    { ...firstPage, snapshotId: "version" },
    { playlistId, offset: 50, snapshotId: null },
    { playlistId, offset: 50, snapshotId: " " },
    { playlistId, offset: 50, snapshotId: {} },
  ])(
    "rejects invalid selections before reading providers: %j",
    async (body) => {
      const { app, deps } = setup();
      const browser = request.agent(app);
      await browser.post("/test/login").send({}).expect(204);
      await browser
        .post(endpoint)
        .set("Content-Type", "application/json")
        .send(JSON.stringify(body))
        .expect(400);
      expect(deps.preparePlaylistPage).not.toHaveBeenCalled();
    }
  );

  it("passes the original snapshot when reading a following page", async () => {
    const { app, deps } = setup();
    const browser = request.agent(app);
    await browser.post("/test/login").send({}).expect(204);
    const selection = { playlistId, offset: 50, snapshotId: "version-1" };
    await browser.post(endpoint).send(selection).expect(200);
    expect(deps.preparePlaylistPage).toHaveBeenCalledExactlyOnceWith(
      selection,
      "session-token"
    );
  });

  it("maps a source change to a conflict instead of returning a partial page", async () => {
    const { app, deps } = setup();
    deps.preparePlaylistPage.mockRejectedValue(
      new PlaylistSourceChangedError()
    );
    const browser = request.agent(app);
    await browser.post("/test/login").send({}).expect(204);
    await browser
      .post(endpoint)
      .send(firstPage)
      .expect(409, {
        error: {
          code: "PLAYLIST_SOURCE_CHANGED",
          message: "Playlista zmieniła się. Spróbuj ponownie.",
        },
      });
  });

  it.each([403, 404, 429, 502, 503, 504])(
    "preserves HTTP %i with the shared error contract",
    async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { app, deps } = setup();
      deps.preparePlaylistPage.mockRejectedValue(
        new SpotifyApiError("Provider error", status, null, {
          category: status === 504 ? "timeout" : undefined,
          retryAfterSeconds: status === 429 ? 60 : null,
        })
      );
      const browser = request.agent(app);
      await browser.post("/test/login").send({}).expect(204);
      const response = await browser
        .post(endpoint)
        .send(firstPage)
        .expect(status);
      expect(response.body.error.code).toBe("SPOTIFY_API_ERROR");
      if (status === 429) expect(response.headers["retry-after"]).toBe("60");
    }
  );
});

function setup() {
  const deps = {
    prepareDataset:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["prepareDataset"]
      >(),
    prepareSavedTracksPage:
      vi.fn<
        Parameters<
          typeof createPlaylistGeneratorRouter
        >[0]["prepareSavedTracksPage"]
      >(),
    preparePlaylistPage: vi
      .fn<
        Parameters<
          typeof createPlaylistGeneratorRouter
        >[0]["preparePlaylistPage"]
      >()
      .mockResolvedValue(preparedPage),
    savePlaylist:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["savePlaylist"]
      >(),
    resumePlaylist:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["resumePlaylist"]
      >(),
    authorize: createEnsureSpotifyAccessToken({
      refresh: vi.fn(),
      now: () => Date.now(),
    }),
  };
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "playlist-source-tests",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post("/test/login", (req, res) => {
    req.session.spotify = {
      accessToken: "session-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
      scope: req.body.scope ?? "playlist-read-private",
      tokenType: "Bearer",
    };
    res.sendStatus(204);
  });
  app.use("/api/playlist-generator", createPlaylistGeneratorRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}
