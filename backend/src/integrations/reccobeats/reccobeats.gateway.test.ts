import { describe, expect, it, vi } from "vitest";

import { ReccoBeatsApiError } from "./reccobeats-api.error.js";
import { createReccoBeatsGateway } from "./reccobeats.gateway.js";

describe("ReccoBeats gateway", () => {
  it("searches for every Spotify ID using repeated query parameters", async () => {
    const responseBody = [
      {
        id: "recco-1",
        href: "https://open.spotify.com/track/spotify1",
        name: "Track 1",
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const gateway = createGateway(fetchMock);

    await expect(
      gateway.findTracksBySpotifyIds(["spotify/id", "second id"])
    ).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reccobeats.test/v1/track?ids=spotify%2Fid&ids=second+id",
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
  });

  it.each([
    ["content", { content: [createTrack()] }],
    ["items", { items: [createTrack()] }],
    ["object array", { object: [createTrack()] }],
    ["nested object items", { object: { items: [createTrack()] } }],
  ])("normalizes tracks from the %s response variant", async (_, body) => {
    const gateway = createGateway(
      vi.fn().mockResolvedValue(jsonResponse(body))
    );

    await expect(gateway.findTracksBySpotifyIds(["spotify1"])).resolves.toEqual(
      [createTrack()]
    );
  });

  it("returns an empty list for a response without tracks", async () => {
    const gateway = createGateway(vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(gateway.findTracksBySpotifyIds(["missing"])).resolves.toEqual(
      []
    );
  });

  it("fetches audio features using an encoded ReccoBeats ID", async () => {
    const responseBody = { tempo: 128, energy: 0.81 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    const gateway = createGateway(fetchMock);

    await expect(gateway.getTrackAudioFeatures("recco/id")).resolves.toEqual(
      responseBody
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reccobeats.test/v1/track/recco%2Fid/audio-features",
      expect.any(Object)
    );
  });

  it("throws ReccoBeatsApiError containing status and response data", async () => {
    const errorData = { message: "Cloudflare tunnel unavailable" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(errorData, { status: 530 }));
    const gateway = createGateway(fetchMock);

    const request = gateway.findTracksBySpotifyIds(["spotify1"]);

    await expect(request).rejects.toBeInstanceOf(ReccoBeatsApiError);
    await expect(request).rejects.toMatchObject({
      message: "Nie udało się pobrać danych z ReccoBeats",
      status: 530,
      data: errorData,
    });
  });
});

function createGateway(fetchImpl: typeof fetch) {
  return createReccoBeatsGateway({
    fetchImpl,
    baseUrl: "https://reccobeats.test",
  });
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createTrack() {
  return {
    id: "recco-1",
    href: "https://open.spotify.com/track/spotify1",
    name: "Track 1",
  };
}
