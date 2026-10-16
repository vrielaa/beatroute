import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlaylistDatasetDependencies,
  PlaylistSaveDependencies,
} from "@application/playlist-generator/types.js";
import type { ReccoBeatsGateway } from "@integrations/reccobeats/reccobeats.gateway.js";
import { ReccoBeatsApiError } from "@integrations/reccobeats/reccobeats-api.error.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { errorHandler } from "@http/error-handler.js";
import playlistGeneratorRouter from "./routes.js";

const adapters = vi.hoisted(() => ({
  spotify: {
    getSpotifyTrackById:
      vi.fn<PlaylistDatasetDependencies["getSpotifyTrackById"]>(),
    getCurrentUserSavedTracks:
      vi.fn<PlaylistDatasetDependencies["getCurrentUserSavedTracks"]>(),
    getPlaylistMetadata:
      vi.fn<PlaylistDatasetDependencies["getPlaylistMetadata"]>(),
    getPlaylistItemsPage:
      vi.fn<PlaylistDatasetDependencies["getPlaylistItemsPage"]>(),
    createPlaylist: vi.fn<PlaylistSaveDependencies["createPlaylist"]>(),
    addTracksToPlaylist:
      vi.fn<PlaylistSaveDependencies["addTracksToPlaylist"]>(),
    getPlaylistContents:
      vi.fn<PlaylistSaveDependencies["getPlaylistContents"]>(),
  },
  reccobeats: {
    findTracksBySpotifyIds:
      vi.fn<ReccoBeatsGateway["findTracksBySpotifyIds"]>(),
    getTrackAudioFeatures: vi.fn<ReccoBeatsGateway["getTrackAudioFeatures"]>(),
  },
}));

vi.mock("@integrations/spotify/spotify.gateway.js", () => ({
  defaultSpotifyGateway: adapters.spotify,
}));

vi.mock("@integrations/reccobeats/reccobeats.gateway.js", () => ({
  defaultReccoBeatsGateway: adapters.reccobeats,
}));

const trackIds = ["A", "B", "C", "D"].map((letter) => letter.repeat(22));
const sourceTracks = trackIds.map((id) => ({
  id,
  name: `Song ${id}`,
  artists: [{ name: "Artist" }],
}));
const playlistId = "P".repeat(22);
const audioFeatures = {
  tempo: 128,
  energy: 0.8,
  danceability: 0.75,
  valence: 0.6,
  acousticness: 0.2,
  instrumentalness: 0.05,
  speechiness: 0.04,
  liveness: 0.1,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  adapters.spotify.getSpotifyTrackById.mockImplementation(async (id) => ({
    name: `Song ${id}`,
    artists: [{ name: "Artist" }],
  }));
  adapters.spotify.getCurrentUserSavedTracks.mockImplementation(
    async (_token, selection) => ({
      items: sourceTracks.map((track) => ({
        added_at: "2026-10-16T08:00:00Z",
        track,
      })),
      total: sourceTracks.length,
      limit: selection.limit,
      offset: selection.offset,
      href: "https://spotify.test/me/tracks",
      next: null,
      previous: null,
    })
  );
  adapters.spotify.getPlaylistMetadata.mockResolvedValue({
    id: playlistId,
    name: "Source playlist",
    snapshotId: "source-version",
  });
  adapters.spotify.getPlaylistItemsPage.mockResolvedValue({
    items: sourceTracks,
    offset: 0,
    total: sourceTracks.length,
  });
  adapters.reccobeats.findTracksBySpotifyIds.mockImplementation(async (ids) =>
    ids.map(createCatalogTrack)
  );
  adapters.reccobeats.getTrackAudioFeatures.mockResolvedValue(audioFeatures);
});

afterEach(() => vi.restoreAllMocks());

describe.each([
  {
    source: "ID file",
    endpoint: "/api/playlist-generator/prepare-dataset",
    body: { version: 1, spotifyTrackIds: trackIds },
  },
  {
    source: "saved tracks",
    endpoint: "/api/playlist-generator/prepare-saved-tracks",
    body: { offset: 0 },
  },
  {
    source: "Spotify playlist",
    endpoint: "/api/playlist-generator/prepare-playlist",
    body: { playlistId, offset: 0, snapshotId: null },
  },
])(
  "production playlist generator composition: $source",
  ({ endpoint, body }) => {
    it("passes strict mode to the real audio service", async () => {
      const audioRead = vi.spyOn(
        reccoBeatsService,
        "getManyTrackAudioFeaturesBySpotifyIds"
      );
      const browser = await createBrowser();

      await browser.post(endpoint).send(body).expect(200);

      expect(audioRead).toHaveBeenCalledExactlyOnceWith(trackIds, {
        errorMode: "strict",
      });
    });

    it.each([
      {
        failure: "rate limit",
        error: new ReccoBeatsApiError(
          "Rate limited",
          429,
          { token: "private-value" },
          { retryAfterSeconds: 30 }
        ),
        status: 429,
      },
      {
        failure: "local cooldown",
        error: new ReccoBeatsApiError("Requests paused", 429, null, {
          upstreamStatus: null,
          retryAfterSeconds: 2,
        }),
        status: 429,
      },
      {
        failure: "timeout",
        error: new ReccoBeatsApiError("Timed out", 504, null, {
          category: "timeout",
        }),
        status: 504,
      },
      {
        failure: "network failure",
        error: new ReccoBeatsApiError("Connection failed", 502, null, {
          category: "network",
        }),
        status: 502,
      },
      {
        failure: "service outage",
        error: new ReccoBeatsApiError("Unavailable", 503, null),
        status: 503,
      },
      {
        failure: "invalid response",
        error: new ReccoBeatsApiError("Invalid response", 200, null, {
          category: "invalid-response",
        }),
        status: 502,
      },
    ])(
      "rejects success mixed with $failure instead of returning skipped tracks",
      async ({ error, status }) => {
        adapters.reccobeats.getTrackAudioFeatures.mockImplementation(
          async (id) => {
            if (id === `recco-${trackIds[1]}`) throw error;
            return audioFeatures;
          }
        );
        const browser = await createBrowser();

        const response = await browser.post(endpoint).send(body).expect(status);

        expect(response.body).toEqual({
          error: {
            code: "RECCOBEATS_API_ERROR",
            message: error.message,
            details: {
              integration: "reccobeats",
              upstreamStatus: error.upstreamStatus,
              ...(error.retryAfterSeconds === null
                ? {}
                : { retryAfterSeconds: error.retryAfterSeconds }),
            },
          },
        });
        if (error.retryAfterSeconds !== null) {
          expect(response.headers["retry-after"]).toBe(
            String(error.retryAfterSeconds)
          );
        }
        expect(response.text).not.toContain("private-value");
        expect(adapters.reccobeats.getTrackAudioFeatures).toHaveBeenCalledTimes(
          4
        );
        expect(adapters.spotify.createPlaylist).not.toHaveBeenCalled();
        expect(adapters.spotify.addTracksToPlaylist).not.toHaveBeenCalled();
      }
    );

    it("still skips catalog and 404 gaps while keeping incomplete measurements and zero", async () => {
      adapters.reccobeats.findTracksBySpotifyIds.mockImplementation(
        async (ids) =>
          ids.filter((id) => id !== trackIds[2]).map(createCatalogTrack)
      );
      adapters.reccobeats.getTrackAudioFeatures.mockImplementation(
        async (id) => {
          if (id === `recco-${trackIds[1]}`) {
            throw new ReccoBeatsApiError("Measurements not found", 404, null);
          }
          return id === `recco-${trackIds[3]}`
            ? { tempo: null, energy: 0 }
            : audioFeatures;
        }
      );
      const browser = await createBrowser();

      const response = await browser.post(endpoint).send(body).expect(200);
      const prepared = response.body.preparedDataset ?? response.body;

      expect(
        prepared.dataset.tracks.map((track: { id: string }) => track.id)
      ).toEqual([trackIds[0], trackIds[3]]);
      expect(prepared.dataset.tracks[1].audioFeatures).toEqual({
        tempo: null,
        energy: 0,
        danceability: null,
        valence: null,
        acousticness: null,
        instrumentalness: null,
        speechiness: null,
        liveness: null,
      });
      expect(prepared.skippedTracks).toEqual([
        { spotifyId: trackIds[1], reason: "audio-features-unavailable" },
        { spotifyId: trackIds[2], reason: "audio-features-unavailable" },
      ]);
      expect(prepared.incompleteTracks).toEqual([
        {
          spotifyId: trackIds[3],
          missingFeatures: [
            "tempo",
            "danceability",
            "valence",
            "acousticness",
            "instrumentalness",
            "speechiness",
            "liveness",
          ],
        },
      ]);
      expect(adapters.reccobeats.getTrackAudioFeatures).toHaveBeenCalledTimes(
        3
      );
      expect(
        adapters.reccobeats.getTrackAudioFeatures
      ).not.toHaveBeenCalledWith(`recco-${trackIds[2]}`);
    });
  }
);

it("does not change the default partial mode for other audio service consumers", async () => {
  adapters.reccobeats.getTrackAudioFeatures.mockImplementation(async (id) => {
    if (id === `recco-${trackIds[1]}`) {
      throw new ReccoBeatsApiError("Rate limited", 429, null);
    }
    return audioFeatures;
  });

  const result =
    await reccoBeatsService.getManyTrackAudioFeaturesBySpotifyIds(trackIds);

  expect(result.filter((track) => !("error" in track))).toHaveLength(3);
  expect(result.filter((track) => "error" in track)).toEqual([
    {
      spotifyId: trackIds[1],
      error: "Rate limited",
    },
  ]);
});

async function createBrowser() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "composition-test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post("/test/login", (req, res) => {
    req.session.spotify = {
      accessToken: "session-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-library-read playlist-read-private",
      tokenType: "Bearer",
    };
    res.sendStatus(204);
  });
  app.use("/api/playlist-generator", playlistGeneratorRouter);
  app.use(errorHandler);
  const browser = request.agent(app);
  await browser.post("/test/login").expect(204);
  return browser;
}

function createCatalogTrack(spotifyId: string) {
  return {
    id: `recco-${spotifyId}`,
    href: `https://open.spotify.com/track/${spotifyId}`,
  };
}
