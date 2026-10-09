import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../app.js";
import { createAppConfig } from "../../../config/app.config.js";
import type {
  PlaylistAudioFeatures,
  PlaylistPreferences,
  PlaylistTrack,
} from "@domain/playlist-generator/types.js";

describe("POST /api/playlist-generator/generate", () => {
  it("filters and ranks supplied tracks without requiring a Spotify session", async () => {
    const first = createTrack("first", { energy: 0.625 });
    const rejected = createTrack("rejected", { tempo: 100, energy: 0.9 });
    const best = createTrack("best", { energy: 0.75 });
    const payload = createPayload([first, rejected, best]);

    const response = await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toEqual({
      rankedTracks: [
        {
          track: best,
          overallMatch: 1,
          featureMatches: [
            { feature: "energy", level: "high", measurement: 0.75, match: 1 },
          ],
        },
        {
          track: first,
          overallMatch: 0.5,
          featureMatches: [
            {
              feature: "energy",
              level: "high",
              measurement: 0.625,
              match: 0.5,
            },
          ],
        },
      ],
      rejectedTracks: [
        {
          track: rejected,
          reasons: [{ feature: "tempo", code: "outside-range" }],
        },
      ],
    });
  });

  it.each([
    {
      field: "dataset",
      message: 'Pole "dataset" musi być obiektem zbioru playlist',
    },
    {
      field: "requirements",
      message: "Niepoprawne wymagania playlisty: musi być obiektem",
    },
    {
      field: "preferences",
      message: "Niepoprawne preferencje playlisty: muszą być obiektem",
    },
  ])("returns 400 for a missing $field section", async ({ field, message }) => {
    const payload: Record<string, unknown> = createPayload();
    delete payload[field];

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(400, { error: { code: "VALIDATION_ERROR", message } });
  });

  it.each(["dataset", "requirements", "preferences"])(
    "returns a validation error for null %s",
    async (field) => {
      const payload = { ...createPayload(), [field]: null };

      const response = await request(createTestApp())
        .post("/api/playlist-generator/generate")
        .send(payload)
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toEqual(expect.any(String));
    }
  );

  it("returns 400 rather than 500 when no body is supplied", async () => {
    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: 'Pole "dataset" musi być obiektem zbioru playlist',
        },
      });
  });

  it("returns 400 when the body is not parsed as JSON", async () => {
    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(createPayload()))
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: 'Pole "dataset" musi być obiektem zbioru playlist',
        },
      });
  });

  it("rejects a top-level JSON array with the validation error contract", async () => {
    const response = await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send([])
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the parser error contract for malformed JSON", async () => {
    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .set("Content-Type", "application/json")
      .send('{"dataset":')
      .expect(400, {
        error: {
          code: "INVALID_JSON",
          message: "Treść żądania nie jest poprawnym JSON-em",
        },
      });
  });

  it("rejects an unsupported dataset version before generating results", async () => {
    const payload = createPayload();

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send({ ...payload, dataset: { ...payload.dataset, version: 2 } })
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Nieobsługiwana wersja zbioru playlist",
        },
      });
  });

  it("rejects invalid requirements before generating results", async () => {
    const payload = createPayload();
    payload.requirements.tempoRange = { min: 140, max: 120 };

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Niepoprawne wymagania playlisty: min nie może być większy niż max w tempoRange",
        },
      });
  });

  it("rejects an invalid preference before generating results", async () => {
    const payload = createPayload();

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send({
        ...payload,
        preferences: { ...payload.preferences, energy: "very-high" },
      })
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Niepoprawne preferencje playlisty: pole energy musi mieć wartość low, medium, high albo null",
        },
      });
  });

  it("rejects more than 500 tracks even when the payload fits the body limit", async () => {
    const tracks = Array.from({ length: 501 }, (_, index) =>
      createTrack(`track-${index}`)
    );
    const payload = createPayload(tracks);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(
      1024 * 1024
    );

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: 'Pole "dataset.tracks" nie może przekraczać limitu 500',
        },
      });
  });

  it("rejects duplicate track identifiers", async () => {
    const track = createTrack("duplicate");

    const response = await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(createPayload([track, track]))
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 and an empty ranking when all tracks fail requirements", async () => {
    const track = createTrack("rejected", { tempo: 100, energy: 0.9 });

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(createPayload([track]))
      .expect(200, {
        rankedTracks: [],
        rejectedTracks: [
          { track, reasons: [{ feature: "tempo", code: "outside-range" }] },
        ],
      });
  });

  it("preserves accepted source order with no active preferences", async () => {
    const first = createTrack("first", { energy: 0.25 });
    const rejected = createTrack("rejected", { tempo: 100 });
    const last = createTrack("last", { energy: 0.9 });
    const payload = createPayload([first, rejected, last]);
    payload.preferences.energy = null;

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(200, {
        rankedTracks: [
          { track: first, overallMatch: null, featureMatches: [] },
          { track: last, overallMatch: null, featureMatches: [] },
        ],
        rejectedTracks: [
          {
            track: rejected,
            reasons: [{ feature: "tempo", code: "outside-range" }],
          },
        ],
      });
  });

  it("preserves null scores and missing measurement reasons in JSON responses", async () => {
    const unscored = createTrack("unscored", { energy: null });
    const zero = createTrack("zero", { energy: 0.25 });
    const rejected = createTrack("rejected", { tempo: null });

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(createPayload([unscored, zero, rejected]))
      .expect(200, {
        rankedTracks: [
          {
            track: zero,
            overallMatch: 0,
            featureMatches: [
              { feature: "energy", level: "high", measurement: 0.25, match: 0 },
            ],
          },
          {
            track: unscored,
            overallMatch: null,
            featureMatches: [
              {
                feature: "energy",
                level: "high",
                measurement: null,
                match: null,
              },
            ],
          },
        ],
        rejectedTracks: [
          {
            track: rejected,
            reasons: [{ feature: "tempo", code: "missing-measurement" }],
          },
        ],
      });
  });

  it("returns normalized metadata without additional input fields", async () => {
    const track = createTrack("track-1");
    const payload = createPayload([
      {
        ...track,
        id: " track-1 ",
        name: ` ${track.name} `,
        artists: [" Example Artist "],
      },
    ]);
    const response = await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send({
        ...payload,
        dataset: {
          ...payload.dataset,
          unused: true,
          tracks: payload.dataset.tracks.map((item) => ({
            ...item,
            unused: true,
          })),
        },
        requirements: { ...payload.requirements, unused: true },
        preferences: { ...payload.preferences, unused: true },
        unused: true,
      })
      .expect(200);

    expect(response.body.rankedTracks[0].track).toEqual(track);
    expect(Object.keys(response.body).sort()).toEqual([
      "rankedTracks",
      "rejectedTracks",
    ]);
  });

  it("accepts 500 tracks above 100kb and below 1mb through the actual app parsers", async () => {
    const tracks = Array.from({ length: 500 }, (_, index) =>
      createTrack(`track-${index}`)
    );
    const payload = createPayload(tracks);
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    expect(bytes).toBeGreaterThan(100 * 1024);
    expect(bytes).toBeLessThan(1024 * 1024);

    const response = await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(200);

    expect(response.body.rankedTracks).toHaveLength(500);
    expect(
      response.body.rankedTracks.map(
        ({ track }: { track: PlaylistTrack }) => track.id
      )
    ).toEqual(tracks.map(({ id }) => id));
    expect(response.body.rejectedTracks).toEqual([]);
  });

  it("returns 413 when generator JSON exceeds 1mb", async () => {
    const payload = createPayload([createTrack("large")]);
    payload.dataset.tracks[0].name = "x".repeat(1024 * 1024);

    await request(createTestApp())
      .post("/api/playlist-generator/generate")
      .send(payload)
      .expect(413, {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Treść żądania przekracza dozwolony rozmiar",
        },
      });
  });
});

function createTestApp() {
  return createApp(
    createAppConfig({
      FRONTEND_URL: "https://frontend.test",
      SESSION_SECRET: "test-session-secret",
      SPOTIFY_CLIENT_ID: "spotify-client-id",
      SPOTIFY_CLIENT_SECRET: "spotify-client-secret",
      SPOTIFY_REDIRECT_URI: "http://backend.test/auth/spotify/callback",
      LASTFM_API_KEY: "lastfm-api-key",
      LASTFM_SHARED_SECRET: "lastfm-shared-secret",
      LASTFM_REDIRECT_URI: "http://backend.test/auth/lastfm/callback",
      SOUNDCHARTS_APP_ID: "soundcharts-app-id",
      SOUNDCHARTS_API_KEY: "soundcharts-api-key",
    })
  );
}

function createPayload(tracks: PlaylistTrack[] = [createTrack("track-1")]) {
  const preferences: PlaylistPreferences = {
    energy: "high",
    danceability: null,
    valence: null,
    acousticness: null,
    instrumentalness: null,
  };

  return {
    dataset: { version: 1, tracks },
    requirements: {
      tempoRange: { min: 120, max: 140 },
      maxSpeechiness: 0.33,
      maxLiveness: 0.8,
    },
    preferences,
  };
}

function createTrack(
  id: string,
  audioFeatures: Partial<PlaylistAudioFeatures> = {}
): PlaylistTrack {
  return {
    id,
    name: `Example Track ${id}`,
    artists: ["Example Artist"],
    audioFeatures: {
      tempo: 128,
      energy: 0.625,
      danceability: 0.75,
      valence: 0.5,
      acousticness: 0.25,
      instrumentalness: 0.1,
      speechiness: 0.1,
      liveness: 0.1,
      ...audioFeatures,
    },
  };
}
