import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaylistSaveService } from "@application/playlist-generator/playlist-save.service.js";
import type {
  PlaylistSaveDependencies,
  PlaylistToSave,
  SavedPlaylist,
} from "@application/playlist-generator/types.js";
import type { SpotifySession } from "@application/auth/types.js";
import { SpotifyReauthorizationRequiredError } from "@application/auth/spotify-reauthorization-required.error.js";
import { errorHandler } from "@http/error-handler.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { createPlaylistGeneratorRouter } from "./routes.js";

const endpoint = "/api/playlist-generator/save";
const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const currentTimeMs = 1_000_000;

afterEach(() => vi.restoreAllMocks());

describe("POST /api/playlist-generator/save", () => {
  it("requires a Spotify session before validating or saving the selection", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .send({})
      .expect(401, {
        error: {
          code: "SPOTIFY_AUTH_REQUIRED",
          message: "Użytkownik nie jest zalogowany do Spotify",
        },
      });

    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("does not authorize with a token or permission supplied in the body", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .send({
        ...createSelection(),
        accessToken: "body-token",
        scope: "playlist-modify-private",
      })
      .expect(401);

    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "user-top-read",
    "playlist-modify-public",
    "playlist-modify-private-extra",
  ])(
    "requires the exact private-playlist permission, not %j",
    async (scope) => {
      const dependencies = createDependencies();
      const browser = request.agent(createTestApp(dependencies));
      await browser
        .post("/test/spotify-login")
        .send(createSpotifySession({ scope }))
        .expect(204);

      await browser
        .post(endpoint)
        .send({ ...createSelection(), scope: "playlist-modify-private" })
        .expect(403, {
          error: {
            code: "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED",
            message:
              "Połącz ponownie konto Spotify i zezwól na zapisywanie prywatnych playlist",
          },
        });

      expect(dependencies.savePlaylist).not.toHaveBeenCalled();
      const savedSession = await browser.get("/test/session").expect(200);
      expect(savedSession.body.spotify).toEqual(
        createSpotifySession({ scope })
      );
    }
  );

  it("normalizes the selection, preserves order and uses only the session token", async () => {
    const dependencies = createDependencies();
    const browser = await createLoggedInBrowser(dependencies);

    const response = await browser
      .post(endpoint)
      .send({
        name: "  Na siłownię  ",
        trackIds: [` ${secondId} `, firstId],
        accessToken: "body-token",
        public: true,
        playlistId: "existing-playlist",
        dataset: { tracks: [] },
      })
      .expect("Content-Type", /json/)
      .expect(201);

    expect(dependencies.savePlaylist).toHaveBeenCalledOnce();
    expect(dependencies.savePlaylist).toHaveBeenCalledWith(
      { name: "Na siłownię", trackIds: [secondId, firstId] },
      "session-access-token"
    );
    expect(response.body).toEqual(createSavedPlaylist());
    expect(response.text).not.toContain("body-token");
    expect(response.text).not.toContain("session-access-token");
    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired session before checking its permission and saving", async () => {
    const dependencies = createDependencies();
    const expiredSession = createSpotifySession({
      expiresAt: currentTimeMs - 1,
      scope: "user-top-read",
    });
    const browser = await createLoggedInBrowser(dependencies, expiredSession);

    await browser.post(endpoint).send(createSelection()).expect(201);

    expect(dependencies.refresh).toHaveBeenCalledWith(expiredSession);
    expect(dependencies.savePlaylist).toHaveBeenCalledWith(
      createSelection(),
      "renewed-access-token"
    );
  });

  it("does not save when the renewed token lacks the private-playlist permission", async () => {
    const dependencies = createDependencies();
    dependencies.refresh.mockResolvedValue(
      createSpotifySession({ scope: "user-top-read" })
    );
    const browser = await createLoggedInBrowser(
      dependencies,
      createSpotifySession({ expiresAt: currentTimeMs - 1 })
    );

    const response = await browser
      .post(endpoint)
      .send(createSelection())
      .expect(403);

    expect(response.body.error.code).toBe(
      "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED"
    );
    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it("does not save when an expired session requires reauthorization", async () => {
    const dependencies = createDependencies();
    dependencies.refresh.mockRejectedValue(
      new SpotifyReauthorizationRequiredError()
    );
    const browser = await createLoggedInBrowser(
      dependencies,
      createSpotifySession({ expiresAt: currentTimeMs - 1 })
    );

    const response = await browser
      .post(endpoint)
      .send(createSelection())
      .expect(401);

    expect(response.body.error.code).toBe("SPOTIFY_REAUTH_REQUIRED");
    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
    const savedSession = await browser.get("/test/session").expect(200);
    expect(savedSession.body.spotify).toBeUndefined();
  });

  it.each([
    {},
    { name: "", trackIds: [firstId] },
    { name: "x".repeat(101), trackIds: [firstId] },
    { name: "Playlist", trackIds: [] },
    { name: "Playlist", trackIds: [firstId, ` ${firstId} `] },
    { name: "Playlist", trackIds: ["invalid"] },
    { name: "Playlist", trackIds: [123] },
    { name: "Playlist", trackIds: [`spotify:track:${firstId}`] },
    { name: "Playlist", trackIds: Array(501).fill(firstId) },
    [],
  ])("rejects invalid selections before saving: %j", async (body) => {
    const dependencies = createDependencies();
    const browser = await createLoggedInBrowser(dependencies);

    const response = await browser.post(endpoint).send(body).expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it("returns validation error rather than 500 when the body is missing", async () => {
    const dependencies = createDependencies();
    const browser = await createLoggedInBrowser(dependencies);

    await browser.post(endpoint).expect(400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Dane do zapisu playlisty muszą być obiektem",
      },
    });

    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before any save operation", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .set("Content-Type", "application/json")
      .send('{"name":')
      .expect(400, {
        error: {
          code: "INVALID_JSON",
          message: "Treść żądania nie jest poprawnym JSON-em",
        },
      });

    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before any save operation", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .send({ ...createSelection(), unused: "x".repeat(1024 * 1024) })
      .expect(413, {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Treść żądania przekracza dozwolony rozmiar",
        },
      });

    expect(dependencies.savePlaylist).not.toHaveBeenCalled();
  });

  it("writes 500 selected tracks in five ordered batches through the actual save service", async () => {
    const dependencies = createDependencies();
    const gateway = createSaveGateway();
    const service = createPlaylistSaveService(gateway);
    const browser = await createLoggedInBrowser({
      ...dependencies,
      savePlaylist: service.savePlaylist,
    });
    const trackIds = createTrackIds(500);

    const response = await browser
      .post(endpoint)
      .send({ name: "Na siłownię", trackIds })
      .expect(201);

    expect(response.body).toEqual({
      ...createSavedPlaylist(),
      trackCount: 500,
    });
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.createPlaylist).toHaveBeenCalledWith(
      "session-access-token",
      "Na siłownię"
    );
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledTimes(5);
    for (let batch = 0; batch < 5; batch += 1) {
      expect(gateway.addTracksToPlaylist).toHaveBeenNthCalledWith(
        batch + 1,
        "session-access-token",
        "new-playlist-id",
        trackIds.slice(batch * 100, (batch + 1) * 100)
      );
    }
  });

  it("returns the ordinary integration error when creating the playlist fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createDependencies();
    const gateway = createSaveGateway();
    gateway.createPlaylist.mockRejectedValue(
      new SpotifyApiError("Spotify unavailable", 503)
    );
    const service = createPlaylistSaveService(gateway);
    const browser = await createLoggedInBrowser({
      ...dependencies,
      savePlaylist: service.savePlaylist,
    });

    const response = await browser
      .post(endpoint)
      .send(createSelection())
      .expect(503);

    expect(response.body.error.code).toBe("SPOTIFY_API_ERROR");
    expect(response.body.error.details.progress).toBeUndefined();
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.addTracksToPlaylist).not.toHaveBeenCalled();
  });

  it("reports partial progress and Retry-After without retrying or creating another playlist", async () => {
    const dependencies = createDependencies();
    const gateway = createSaveGateway();
    gateway.addTracksToPlaylist
      .mockResolvedValueOnce({ snapshot_id: "first-snapshot" })
      .mockRejectedValueOnce(
        new SpotifyApiError(
          "Rate limit",
          429,
          { accessToken: "secret-token" },
          { retryAfterSeconds: 30 }
        )
      );
    const service = createPlaylistSaveService(gateway);
    const browser = await createLoggedInBrowser({
      ...dependencies,
      savePlaylist: service.savePlaylist,
    });

    const response = await browser
      .post(endpoint)
      .send(createSelection(createTrackIds(201)))
      .expect(429)
      .expect("Retry-After", "30");

    expect(response.body.error.code).toBe("PLAYLIST_SAVE_INCOMPLETE");
    expect(response.body.error.details).toEqual({
      progress: {
        id: "new-playlist-id",
        name: "Na siłownię",
        spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
        confirmedTrackCount: 100,
        requestedTrackCount: 201,
      },
      retryAfterSeconds: 30,
    });
    expect(response.body.error.message).toContain(
      "Sprawdź utworzoną playlistę"
    );
    expect(response.text).not.toContain("secret-token");
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledTimes(2);
  });

  it("reports an existing playlist with zero confirmations when the first write times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createDependencies();
    const gateway = createSaveGateway();
    gateway.addTracksToPlaylist.mockRejectedValue(
      new SpotifyApiError("Timeout", 504, null, { category: "timeout" })
    );
    const service = createPlaylistSaveService(gateway);
    const browser = await createLoggedInBrowser({
      ...dependencies,
      savePlaylist: service.savePlaylist,
    });

    const response = await browser
      .post(endpoint)
      .send(createSelection())
      .expect(504);

    expect(response.body.error.code).toBe("PLAYLIST_SAVE_INCOMPLETE");
    expect(response.body.error.details.progress).toMatchObject({
      id: "new-playlist-id",
      confirmedTrackCount: 0,
      requestedTrackCount: 2,
    });
    expect(gateway.createPlaylist).toHaveBeenCalledOnce();
    expect(gateway.addTracksToPlaylist).toHaveBeenCalledOnce();
  });

  it("does not expose diagnostic data for an unexpected save failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createDependencies();
    dependencies.savePlaylist.mockRejectedValue(
      new Error("secret-internal-details")
    );
    const browser = await createLoggedInBrowser(dependencies);

    await browser
      .post(endpoint)
      .send(createSelection())
      .expect(500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Wewnętrzny błąd serwera",
        },
      });

    expect(dependencies.savePlaylist).toHaveBeenCalledOnce();
  });
});

function createDependencies() {
  const refresh = vi
    .fn<(session: SpotifySession | undefined) => Promise<SpotifySession>>()
    .mockResolvedValue(
      createSpotifySession({ accessToken: "renewed-access-token" })
    );
  return {
    prepareDataset: vi
      .fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["prepareDataset"]
      >()
      .mockRejectedValue(new Error("Unexpected dataset preparation")),
    savePlaylist: vi
      .fn<Parameters<typeof createPlaylistGeneratorRouter>[0]["savePlaylist"]>()
      .mockResolvedValue(createSavedPlaylist()),
    refresh,
    authorize: createEnsureSpotifyAccessToken({
      refresh,
      now: () => currentTimeMs,
    }),
  };
}

function createTestApp(
  dependencies: Parameters<typeof createPlaylistGeneratorRouter>[0]
) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      secret: "playlist-save-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post("/test/spotify-login", (req, res) => {
    req.session.spotify = req.body;
    res.sendStatus(204);
  });
  app.get("/test/session", (req, res) =>
    res.json({ spotify: req.session.spotify })
  );
  app.use(
    "/api/playlist-generator",
    createPlaylistGeneratorRouter(dependencies)
  );
  app.use(errorHandler);
  return app;
}

async function createLoggedInBrowser(
  dependencies: Parameters<typeof createPlaylistGeneratorRouter>[0],
  spotifySession = createSpotifySession()
) {
  const browser = request.agent(createTestApp(dependencies));
  await browser.post("/test/spotify-login").send(spotifySession).expect(204);
  return browser;
}

function createSpotifySession(
  overrides: Partial<SpotifySession> = {}
): SpotifySession {
  return {
    accessToken: "session-access-token",
    refreshToken: "session-refresh-token",
    expiresAt: currentTimeMs + 3_600_000,
    scope: "user-top-read playlist-modify-private",
    tokenType: "Bearer",
    ...overrides,
  };
}

function createSelection(trackIds = [firstId, secondId]): PlaylistToSave {
  return { name: "Na siłownię", trackIds };
}

function createSavedPlaylist(): SavedPlaylist {
  return {
    id: "new-playlist-id",
    name: "Na siłownię",
    spotifyUrl: "https://open.spotify.com/playlist/new-playlist-id",
    trackCount: 2,
  };
}

function createSaveGateway() {
  return {
    createPlaylist: vi
      .fn<PlaylistSaveDependencies["createPlaylist"]>()
      .mockResolvedValue({
        id: "new-playlist-id",
        name: "Na siłownię",
        external_urls: {
          spotify: "https://open.spotify.com/playlist/new-playlist-id",
        },
      }),
    addTracksToPlaylist: vi
      .fn<PlaylistSaveDependencies["addTracksToPlaylist"]>()
      .mockResolvedValue({ snapshot_id: "snapshot-id" }),
  };
}

function createTrackIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index.toString(36).padStart(22, "0")
  );
}
