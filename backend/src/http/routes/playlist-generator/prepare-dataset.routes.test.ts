import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaylistDatasetService } from "@application/playlist-generator/playlist-dataset.service.js";
import type {
  PlaylistTrackIdsFile,
  PreparedPlaylistDataset,
} from "@application/playlist-generator/types.js";
import type { SpotifySession } from "@application/auth/types.js";
import { SpotifyReauthorizationRequiredError } from "@application/auth/spotify-reauthorization-required.error.js";
import { errorHandler } from "@http/error-handler.js";
import { createEnsureSpotifyAccessToken } from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import { SpotifyApiError } from "@integrations/spotify/spotify-api.error.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { createPlaylistGeneratorRouter } from "./routes.js";

const endpoint = "/api/playlist-generator/prepare-dataset";
const firstId = "3sNVsP50132BTNlImLx70i";
const secondId = "4U4LEUWV8sFtos5PdjfDA7";
const currentTimeMs = 1_000_000;

afterEach(() => vi.restoreAllMocks());

describe("POST /api/playlist-generator/prepare-dataset", () => {
  it("requires a Spotify session before validating IDs or preparing data", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    await request(app)
      .post(endpoint)
      .send({})
      .expect(401, {
        error: {
          code: "SPOTIFY_AUTH_REQUIRED",
          message: "Użytkownik nie jest zalogowany do Spotify",
        },
      });

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("does not accept a body token as authorization", async () => {
    const dependencies = createDependencies();
    const app = createTestApp(dependencies);

    await request(app)
      .post(endpoint)
      .send({ ...createFile(), accessToken: "body-token" })
      .expect(401);

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
  });

  it("normalizes IDs and uses the session token rather than a body token", async () => {
    const dependencies = createDependencies();
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    const response = await browser
      .post(endpoint)
      .send({
        version: 1,
        spotifyTrackIds: [` ${secondId} `, firstId, secondId],
        accessToken: "body-token",
        dataset: { tracks: [{ name: "Metadata from the request" }] },
      })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(dependencies.prepareDataset).toHaveBeenCalledOnce();
    expect(dependencies.prepareDataset).toHaveBeenCalledWith(
      createFile([secondId, firstId]),
      "session-access-token"
    );
    expect(response.body).toEqual(createPreparedDataset([secondId, firstId]));
    expect(response.text).not.toContain("body-token");
    expect(response.text).not.toContain("session-access-token");
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired session before preparing data", async () => {
    const dependencies = createDependencies();
    const browser = request.agent(createTestApp(dependencies));
    const expiredSession = createSpotifySession({
      expiresAt: currentTimeMs - 1,
    });
    await browser.post("/test/spotify-login").send(expiredSession).expect(204);

    await browser.post(endpoint).send(createFile()).expect(200);

    expect(dependencies.refresh).toHaveBeenCalledOnce();
    expect(dependencies.refresh).toHaveBeenCalledWith(expiredSession);
    expect(dependencies.prepareDataset).toHaveBeenCalledWith(
      createFile(),
      "renewed-access-token"
    );
    const sessionResponse = await browser.get("/test/session").expect(200);
    expect(sessionResponse.body.spotify.accessToken).toBe(
      "renewed-access-token"
    );
  });

  it("does not prepare data when Spotify requires reauthorization", async () => {
    const dependencies = createDependencies();
    dependencies.refresh.mockRejectedValue(
      new SpotifyReauthorizationRequiredError()
    );
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession({ expiresAt: currentTimeMs - 1 }))
      .expect(204);

    await browser
      .post(endpoint)
      .send(createFile())
      .expect(401, {
        error: {
          code: "SPOTIFY_REAUTH_REQUIRED",
          message: "Połącz ponownie konto Spotify",
        },
      });

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
    const sessionResponse = await browser.get("/test/session").expect(200);
    expect(sessionResponse.body.spotify).toBeUndefined();
  });

  it.each([
    {},
    { version: 2, spotifyTrackIds: [firstId] },
    { version: 1, spotifyTrackIds: [] },
    { version: 1, spotifyTrackIds: ["invalid"] },
    { version: 1, spotifyTrackIds: [123] },
    {
      version: 1,
      spotifyTrackIds: ["https://open.spotify.com/track/" + firstId],
    },
    { version: 1, spotifyTrackIds: Array(501).fill(firstId) },
    { version: 1, tracks: [] },
    [],
  ])(
    "validates the file before calling the preparation service: %j",
    async (body) => {
      const dependencies = createDependencies();
      const browser = request.agent(createTestApp(dependencies));
      await browser
        .post("/test/spotify-login")
        .send(createSpotifySession())
        .expect(204);

      const response = await browser.post(endpoint).send(body).expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(dependencies.prepareDataset).not.toHaveBeenCalled();
    }
  );

  it("returns validation error rather than 500 when body is missing", async () => {
    const dependencies = createDependencies();
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    await browser.post(endpoint).expect(400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Plik z identyfikatorami musi być obiektem",
      },
    });

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
  });

  it("returns the parser error contract for malformed JSON", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .set("Content-Type", "application/json")
      .send('{"version":')
      .expect(400, {
        error: {
          code: "INVALID_JSON",
          message: "Treść żądania nie jest poprawnym JSON-em",
        },
      });

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before preparing data", async () => {
    const dependencies = createDependencies();

    await request(createTestApp(dependencies))
      .post(endpoint)
      .send({ ...createFile(), unused: "x".repeat(1024 * 1024) })
      .expect(413, {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Treść żądania przekracza dozwolony rozmiar",
        },
      });

    expect(dependencies.prepareDataset).not.toHaveBeenCalled();
  });

  it("accepts a file containing exactly 500 identifiers", async () => {
    const dependencies = createDependencies();
    const browser = request.agent(createTestApp(dependencies));
    const ids = Array.from({ length: 500 }, (_, index) =>
      index.toString(36).padStart(22, "0")
    );
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    const response = await browser
      .post(endpoint)
      .send(createFile(ids))
      .expect(200);

    expect(response.body.dataset.tracks).toHaveLength(500);
    expect(dependencies.prepareDataset).toHaveBeenCalledOnce();
    expect(dependencies.prepareDataset).toHaveBeenCalledWith(
      createFile(ids),
      "session-access-token"
    );
  });

  it("returns skipped IDs, partial measurements and nulls without changing the service result", async () => {
    const dependencies = createDependencies();
    const prepared = createPreparedDataset();
    prepared.dataset.tracks[0].audioFeatures.energy = null;
    prepared.skippedTracks = [
      { spotifyId: secondId, reason: "metadata-unavailable" },
    ];
    prepared.incompleteTracks = [
      { spotifyId: firstId, missingFeatures: ["energy"] },
    ];
    dependencies.prepareDataset.mockResolvedValue(prepared);
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    await browser
      .post(endpoint)
      .send(createFile([firstId, secondId]))
      .expect(200, prepared);
  });

  it("returns 200 with an empty dataset when no track can be prepared", async () => {
    const dependencies = createDependencies();
    const prepared = createPreparedDataset([]);
    prepared.skippedTracks = [
      { spotifyId: firstId, reason: "audio-features-unavailable" },
    ];
    dependencies.prepareDataset.mockResolvedValue(prepared);
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    await browser.post(endpoint).send(createFile()).expect(200, prepared);
  });

  it("runs the actual preparation service through HTTP using injected metadata and measurements", async () => {
    const dependencies = createDependencies();
    const getSpotifyTrackById = vi.fn().mockResolvedValue({
      name: " Prepared song ",
      artists: [{ name: " Artist " }],
    });
    const getAudioFeaturesBySpotifyIds = vi.fn().mockResolvedValue([
      {
        id: "reccobeats-id",
        spotifyId: firstId,
        ...createPreparedDataset().dataset.tracks[0].audioFeatures,
        key: null,
        mode: null,
        loudness: null,
        timeSignature: null,
      },
    ]);
    const service = createPlaylistDatasetService({
      getSpotifyTrackById,
      getAudioFeaturesBySpotifyIds,
    });
    const browser = request.agent(
      createTestApp({ ...dependencies, prepareDataset: service.prepareDataset })
    );
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    const response = await browser
      .post(endpoint)
      .send(createFile())
      .expect(200);

    expect(response.body.dataset.tracks[0]).toEqual({
      ...createPreparedDataset().dataset.tracks[0],
      name: "Prepared song",
      artists: ["Artist"],
    });
    expect(getSpotifyTrackById).toHaveBeenCalledOnce();
    expect(getSpotifyTrackById).toHaveBeenCalledWith(
      firstId,
      "session-access-token"
    );
    expect(getAudioFeaturesBySpotifyIds).toHaveBeenCalledOnce();
    expect(getAudioFeaturesBySpotifyIds).toHaveBeenCalledWith([firstId]);
  });

  it.each([
    {
      error: new SpotifyApiError("Spotify rejected access", 401),
      status: 401,
      code: "SPOTIFY_API_ERROR",
    },
    {
      error: new SpotifyApiError("Spotify denied access", 403),
      status: 403,
      code: "SPOTIFY_API_ERROR",
    },
    {
      error: new SpotifyApiError("Spotify timeout", 504, null, {
        category: "timeout",
      }),
      status: 504,
      code: "SPOTIFY_API_ERROR",
    },
    {
      error: new ReccoBeatsApiError("ReccoBeats unavailable", 503, null),
      status: 503,
      code: "RECCOBEATS_API_ERROR",
    },
    {
      error: new ReccoBeatsApiError("ReccoBeats gateway error", 530, null),
      status: 502,
      code: "RECCOBEATS_API_ERROR",
    },
  ])(
    "uses the existing HTTP mapper for $code status $status",
    async ({ error, status, code }) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const dependencies = createDependencies();
      dependencies.prepareDataset.mockRejectedValue(error);
      const browser = request.agent(createTestApp(dependencies));
      await browser
        .post("/test/spotify-login")
        .send(createSpotifySession())
        .expect(204);

      const response = await browser
        .post(endpoint)
        .send(createFile())
        .expect(status);

      expect(response.body).toEqual({
        error: {
          code,
          message: error.message,
          details: {
            integration: error.integration,
            upstreamStatus: error.upstreamStatus,
          },
        },
      });
      expect(response.body.dataset).toBeUndefined();
    }
  );

  it.each(["spotify", "reccobeats"])(
    "preserves Retry-After when %s reaches its limit",
    async (integration) => {
      const dependencies = createDependencies();
      const error =
        integration === "spotify"
          ? new SpotifyApiError(
              "Spotify rate limit",
              429,
              { token: "private-data" },
              { retryAfterSeconds: 30 }
            )
          : new ReccoBeatsApiError(
              "ReccoBeats rate limit",
              429,
              { token: "private-data" },
              { retryAfterSeconds: 30 }
            );
      dependencies.prepareDataset.mockRejectedValue(error);
      const browser = request.agent(createTestApp(dependencies));
      await browser
        .post("/test/spotify-login")
        .send(createSpotifySession())
        .expect(204);

      const response = await browser
        .post(endpoint)
        .send(createFile())
        .expect("Retry-After", "30")
        .expect(429);

      expect(response.body.error.details).toEqual({
        integration,
        upstreamStatus: 429,
        retryAfterSeconds: 30,
      });
      expect(response.text).not.toContain("private-data");
    }
  );

  it("does not expose diagnostic data for an unexpected exception", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = createDependencies();
    dependencies.prepareDataset.mockRejectedValue(
      new Error("Private diagnostic information")
    );
    const browser = request.agent(createTestApp(dependencies));
    await browser
      .post("/test/spotify-login")
      .send(createSpotifySession())
      .expect(204);

    await browser
      .post(endpoint)
      .send(createFile())
      .expect(500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Wewnętrzny błąd serwera",
        },
      });
  });
});

function createDependencies() {
  const prepareDataset = vi
    .fn<Parameters<typeof createPlaylistGeneratorRouter>[0]["prepareDataset"]>()
    .mockImplementation(async (file) =>
      createPreparedDataset(file.spotifyTrackIds)
    );
  const refresh = vi
    .fn<(session: SpotifySession | undefined) => Promise<SpotifySession>>()
    .mockResolvedValue(
      createSpotifySession({ accessToken: "renewed-access-token" })
    );

  return {
    prepareDataset,
    savePlaylist: vi
      .fn<Parameters<typeof createPlaylistGeneratorRouter>[0]["savePlaylist"]>()
      .mockRejectedValue(new Error("Unexpected playlist save")),
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
      secret: "playlist-test-secret",
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

function createSpotifySession(
  overrides: Partial<SpotifySession> = {}
): SpotifySession {
  return {
    accessToken: "session-access-token",
    refreshToken: "session-refresh-token",
    expiresAt: currentTimeMs + 3_600_000,
    scope: "user-top-read",
    tokenType: "Bearer",
    ...overrides,
  };
}

function createFile(spotifyTrackIds = [firstId]): PlaylistTrackIdsFile {
  return { version: 1, spotifyTrackIds };
}

function createPreparedDataset(
  spotifyIds = [firstId]
): PreparedPlaylistDataset {
  return {
    dataset: {
      version: 1,
      tracks: spotifyIds.map((id) => ({
        id,
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
      })),
    },
    skippedTracks: [],
    incompleteTracks: [],
  };
}
