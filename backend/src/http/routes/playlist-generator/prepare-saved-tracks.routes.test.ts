import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpotifySession } from "@application/auth/types.js";
import { SpotifyReauthorizationRequiredError } from "@application/auth/spotify-reauthorization-required.error.js";
import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import type {
  PlaylistDatasetDependencies,
  PreparedSavedTracksPage,
} from "@application/playlist-generator/types.js";
import { errorHandler } from "@http/error-handler.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { createPlaylistGeneratorRouter } from "./routes.js";

const endpoint = "/api/playlist-generator/prepare-saved-tracks";
const currentTimeMs = 1_000_000;
const firstId = "3sNVsP50132BTNlImLx70i";

afterEach(() => vi.restoreAllMocks());

describe("POST /api/playlist-generator/prepare-saved-tracks", () => {
  it("requires a session before validating the body or preparing data", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .send({ accessToken: "body-token" })
      .expect(401, {
        error: {
          code: "SPOTIFY_AUTH_REQUIRED",
          message: "Użytkownik nie jest zalogowany do Spotify",
        },
      });

    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "user-top-read", "user-library-read-extra"])(
    "requires the exact user-library-read permission: %s",
    async (scope) => {
      const dependencies = createDependencies();
      const browser = await createLoggedInBrowser(dependencies, { scope });

      await browser
        .post(endpoint)
        .send({ scope: "user-library-read" })
        .expect(403, {
          error: {
            code: "SPOTIFY_LIBRARY_PERMISSION_REQUIRED",
            message:
              "Połącz ponownie Spotify i zezwól na odczyt zapisanych utworów",
          },
        });

      expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
      expect(dependencies.refresh).not.toHaveBeenCalled();
      const stored = await browser.get("/test/session").expect(200);
      expect(stored.body.spotify.accessToken).toBe("session-access-token");
    }
  );

  it.each([0, 50, 499])(
    "prepares offset %s using only the session token and preserves the response",
    async (offset) => {
      const dependencies = createDependencies();
      const preparedPage = createPreparedPage(offset);
      dependencies.prepareSavedTracksPage.mockResolvedValue(preparedPage);
      const browser = await createLoggedInBrowser(dependencies, {
        scope: " user-top-read\tuser-library-read\nplaylist-modify-private ",
      });

      const response = await browser
        .post(endpoint)
        .send({
          offset,
          accessToken: "body-token",
          userId: "another-user",
          limit: 500,
          dataset: { tracks: [] },
        })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toEqual(preparedPage);
      expect(
        dependencies.prepareSavedTracksPage
      ).toHaveBeenCalledExactlyOnceWith(offset, "session-access-token");
      expect(dependencies.prepareDataset).not.toHaveBeenCalled();
      expect(dependencies.savePlaylist).not.toHaveBeenCalled();
      expect(dependencies.resumePlaylist).not.toHaveBeenCalled();
      expect(dependencies.refresh).not.toHaveBeenCalled();
      expect(response.text).not.toContain("body-token");
      expect(response.text).not.toContain("session-access-token");
    }
  );

  it("returns an empty library as a successful result", async () => {
    const dependencies = createDependencies();
    const emptyPage: PreparedSavedTracksPage = {
      preparedDataset: {
        dataset: { version: 1, tracks: [] },
        skippedTracks: [],
        incompleteTracks: [],
      },
      pagination: {
        offset: 0,
        processedItems: 0,
        totalItems: 0,
        nextOffset: null,
      },
      unavailableItemsCount: 0,
    };
    dependencies.prepareSavedTracksPage.mockResolvedValue(emptyPage);
    const browser = await createLoggedInBrowser(dependencies);

    await browser.post(endpoint).send({ offset: 0 }).expect(200, emptyPage);
  });

  it.each([
    {},
    [],
    { offset: null },
    { offset: "0" },
    { offset: true },
    { offset: [] },
    { offset: {} },
    { offset: -1 },
    { offset: 500 },
    { offset: 1.5 },
  ])("rejects invalid body %j before preparing data", async (body) => {
    const dependencies = createDependencies();
    const browser = await createLoggedInBrowser(dependencies);

    const response = await browser.post(endpoint).send(body).expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
  });

  it("rejects a missing JSON body", async () => {
    const dependencies = createDependencies();
    const browser = await createLoggedInBrowser(dependencies);

    const response = await browser.post(endpoint).expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
  });

  it("uses the renewed token and permissions after refreshing an expired session", async () => {
    const dependencies = createDependencies();
    const expiredSession = createSpotifySession({
      expiresAt: currentTimeMs - 1,
      scope: "user-top-read",
    });
    const browser = await createLoggedInBrowser(dependencies, expiredSession);

    await browser.post(endpoint).send({ offset: 50 }).expect(200);

    expect(dependencies.refresh).toHaveBeenCalledExactlyOnceWith(
      expiredSession
    );
    expect(dependencies.prepareSavedTracksPage).toHaveBeenCalledExactlyOnceWith(
      50,
      "renewed-access-token"
    );
    const stored = await browser.get("/test/session").expect(200);
    expect(stored.body.spotify.accessToken).toBe("renewed-access-token");
  });

  it("checks renewed permissions rather than the expired session scope", async () => {
    const dependencies = createDependencies();
    dependencies.refresh.mockResolvedValue(createSpotifySession({ scope: "" }));
    const browser = await createLoggedInBrowser(dependencies, {
      expiresAt: currentTimeMs - 1,
    });

    const response = await browser
      .post(endpoint)
      .send({ offset: 0 })
      .expect(403);

    expect(response.body.error.code).toBe(
      "SPOTIFY_LIBRARY_PERMISSION_REQUIRED"
    );
    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
  });

  it("clears Spotify only when the session cannot be renewed", async () => {
    const dependencies = createDependencies();
    dependencies.refresh.mockRejectedValue(
      new SpotifyReauthorizationRequiredError()
    );
    const browser = await createLoggedInBrowser(dependencies, {
      expiresAt: currentTimeMs - 1,
    });

    const response = await browser
      .post(endpoint)
      .send({ offset: 0 })
      .expect(401);

    expect(response.body.error.code).toBe("SPOTIFY_REAUTH_REQUIRED");
    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
    const stored = await browser.get("/test/session").expect(200);
    expect(stored.body.spotify).toBeUndefined();
  });

  it("keeps the session when refresh fails temporarily", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dependencies = createDependencies();
    dependencies.refresh.mockRejectedValue(
      new SpotifyApiError("Spotify unavailable", 503)
    );
    const expiredSession = createSpotifySession({
      expiresAt: currentTimeMs - 1,
    });
    const browser = await createLoggedInBrowser(dependencies, expiredSession);

    const response = await browser
      .post(endpoint)
      .send({ offset: 0 })
      .expect(503);

    expect(response.body.error.code).toBe("SPOTIFY_API_ERROR");
    expect(dependencies.prepareSavedTracksPage).not.toHaveBeenCalled();
    const stored = await browser.get("/test/session").expect(200);
    expect(stored.body.spotify).toEqual(expiredSession);
  });

  it.each([
    {
      error: new SpotifyApiError("Access denied", 403),
      status: 403,
      code: "SPOTIFY_API_ERROR",
    },
    {
      error: new SpotifyApiError("Invalid response", 200, null, {
        category: "invalid-response",
      }),
      status: 502,
      code: "SPOTIFY_API_ERROR",
    },
    {
      error: new ReccoBeatsApiError("Audio unavailable", 503, null),
      status: 503,
      code: "RECCOBEATS_API_ERROR",
    },
    {
      error: new ReccoBeatsApiError("Audio timeout", 504, null, {
        category: "timeout",
      }),
      status: 504,
      code: "RECCOBEATS_API_ERROR",
    },
  ])(
    "forwards integration error $code with status $status",
    async ({ error, status, code }) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const dependencies = createDependencies();
      dependencies.prepareSavedTracksPage.mockRejectedValue(error);
      const browser = await createLoggedInBrowser(dependencies);

      const response = await browser
        .post(endpoint)
        .send({ offset: 0 })
        .expect(status);

      expect(response.body.error.code).toBe(code);
      expect(response.body).not.toHaveProperty("preparedDataset");
      expect(dependencies.prepareSavedTracksPage).toHaveBeenCalledOnce();
      const stored = await browser.get("/test/session").expect(200);
      expect(stored.body.spotify.accessToken).toBe("session-access-token");
    }
  );

  it.each([
    new SpotifyApiError(
      "Spotify rate limited",
      429,
      { secret: "diagnostics" },
      { retryAfterSeconds: 30 }
    ),
    new ReccoBeatsApiError(
      "Audio rate limited",
      429,
      { secret: "diagnostics" },
      { retryAfterSeconds: 30 }
    ),
  ])(
    "preserves Retry-After from $name without retrying preparation",
    async (error) => {
      const dependencies = createDependencies();
      dependencies.prepareSavedTracksPage.mockRejectedValue(error);
      const browser = await createLoggedInBrowser(dependencies);

      const response = await browser
        .post(endpoint)
        .send({ offset: 0 })
        .expect(429)
        .expect("Retry-After", "30");

      expect(response.body.error.details.retryAfterSeconds).toBe(30);
      expect(response.text).not.toContain("diagnostics");
      expect(dependencies.prepareSavedTracksPage).toHaveBeenCalledOnce();
    }
  );

  it("does not expose unexpected error diagnostics", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dependencies = createDependencies();
    dependencies.prepareSavedTracksPage.mockRejectedValue(
      new Error("secret diagnostics")
    );
    const browser = await createLoggedInBrowser(dependencies);

    await browser
      .post(endpoint)
      .send({ offset: 0 })
      .expect(500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Wewnętrzny błąd serwera",
        },
      });
  });

  it("prepares one real service page using library metadata without individual Spotify reads", async () => {
    const dependencies = createDependencies();
    const getSpotifyTrackById =
      vi.fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>();
    const getCurrentUserSavedTracks = vi
      .fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>()
      .mockResolvedValue({
        href: "https://api.spotify.com/v1/me/tracks?limit=50&offset=0",
        limit: 50,
        offset: 0,
        total: 100,
        next: "https://api.spotify.com/v1/me/tracks?limit=50&offset=3",
        previous: null,
        items: [
          {
            added_at: "2026-10-15T10:00:00Z",
            track: {
              id: firstId,
              name: " Song ",
              artists: [{ name: " Artist " }],
            },
          },
          { added_at: "2026-10-15T10:00:00Z", track: null },
          {
            added_at: "2026-10-15T10:00:00Z",
            track: { id: firstId, name: "Song", artists: [{ name: "Artist" }] },
          },
        ],
      });
    const getAudioFeaturesBySpotifyIds = vi
      .fn<PlaylistDatasetDependencies["getAudioFeaturesBySpotifyIds"]>()
      .mockResolvedValue([
        {
          id: "audio-id",
          spotifyId: firstId,
          ...createPreparedPage().preparedDataset.dataset.tracks[0]
            .audioFeatures,
          key: null,
          mode: null,
          loudness: null,
          timeSignature: null,
        },
      ]);
    const service = createPlaylistDatasetService({
      getSpotifyTrackById,
      getCurrentUserSavedTracks,
      getAudioFeaturesBySpotifyIds,
    });
    const browser = await createLoggedInBrowser({
      ...dependencies,
      prepareSavedTracksPage: service.prepareSavedTracksPage,
    });

    const response = await browser
      .post(endpoint)
      .send({ offset: 0 })
      .expect(200);

    expect(getCurrentUserSavedTracks).toHaveBeenCalledExactlyOnceWith(
      "session-access-token",
      { limit: 50, offset: 0 }
    );
    expect(getSpotifyTrackById).not.toHaveBeenCalled();
    expect(getAudioFeaturesBySpotifyIds).toHaveBeenCalledExactlyOnceWith([
      firstId,
    ]);
    expect(response.body.preparedDataset.dataset.tracks).toEqual([
      {
        ...createPreparedPage().preparedDataset.dataset.tracks[0],
        name: "Song",
        artists: ["Artist"],
      },
    ]);
    expect(response.body.pagination).toEqual({
      offset: 0,
      processedItems: 3,
      totalItems: 100,
      nextOffset: 3,
    });
    expect(response.body.unavailableItemsCount).toBe(1);
  });
});

function createDependencies() {
  const refresh = vi
    .fn<(session: SpotifySession | undefined) => Promise<SpotifySession>>()
    .mockResolvedValue(
      createSpotifySession({ accessToken: "renewed-access-token" })
    );

  return {
    prepareSavedTracksPage: vi
      .fn<
        Parameters<
          typeof createPlaylistGeneratorRouter
        >[0]["prepareSavedTracksPage"]
      >()
      .mockImplementation(async (offset) => createPreparedPage(offset)),
    prepareDataset:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["prepareDataset"]
      >(),
    savePlaylist:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["savePlaylist"]
      >(),
    resumePlaylist:
      vi.fn<
        Parameters<typeof createPlaylistGeneratorRouter>[0]["resumePlaylist"]
      >(),
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
      secret: "saved-tracks-test-secret",
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
  overrides: Partial<SpotifySession> = {}
) {
  const browser = request.agent(createTestApp(dependencies));
  await browser
    .post("/test/spotify-login")
    .send(createSpotifySession(overrides))
    .expect(204);
  return browser;
}

function createSpotifySession(
  overrides: Partial<SpotifySession> = {}
): SpotifySession {
  return {
    accessToken: "session-access-token",
    refreshToken: "session-refresh-token",
    expiresAt: currentTimeMs + 3_600_000,
    scope: "user-library-read",
    tokenType: "Bearer",
    ...overrides,
  };
}

function createPreparedPage(offset = 0): PreparedSavedTracksPage {
  return {
    preparedDataset: {
      dataset: {
        version: 1,
        tracks: [
          {
            id: firstId,
            name: "Example song",
            artists: ["Example artist"],
            audioFeatures: {
              tempo: 128,
              energy: 0.8,
              danceability: 0.75,
              valence: 0.6,
              acousticness: 0.2,
              instrumentalness: 0.05,
              speechiness: 0.04,
              liveness: 0.1,
            },
          },
        ],
      },
      skippedTracks: [],
      incompleteTracks: [],
    },
    pagination: {
      offset,
      processedItems: 1,
      totalItems: offset + 1,
      nextOffset: null,
    },
    unavailableItemsCount: 0,
  };
}
