import { describe, expect, it, vi } from "vitest";

import { createSoundchartsService } from "./service.js";
import { SoundchartsApiError } from "./soundcharts-api.error.js";
import type { SoundchartsApiSongResponse } from "./types.js";

describe("Soundcharts service", () => {
  it("encodes Spotify IDs and maps audio features", async () => {
    const request = vi.fn().mockResolvedValue(createSongResponse());
    const service = createSoundchartsService({ request });

    await expect(
      service.getTrackAudioFeaturesBySpotifyId("id/with space")
    ).resolves.toEqual({
      uuid: "soundcharts-uuid",
      acousticness: 0.2,
      danceability: 0.7,
      energy: 0.8,
      instrumentalness: 0.1,
      key: 4,
      liveness: 0.15,
      loudness: -5,
      mode: 1,
      speechiness: 0.05,
      tempo: 125,
      timeSignature: 4,
      valence: 0.65,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/v2.25/song/by-platform/spotify/id%2Fwith%20space"
    );
  });

  it("requests metadata by an encoded UUID", async () => {
    const response = createSongResponse();
    const request = vi.fn().mockResolvedValue(response);
    const service = createSoundchartsService({ request });

    await expect(service.getSongMetadataByUuid("uuid/1")).resolves.toBe(
      response
    );
    expect(request).toHaveBeenCalledWith("/api/v2.25/song/uuid%2F1");
  });

  it("rejects API error containers and incomplete song data", async () => {
    const apiErrorService = createSoundchartsService({
      request: vi.fn().mockResolvedValue({
        errors: [{ key: "not_found", code: 404, message: "Not found" }],
      }),
    });
    const incompleteService = createSoundchartsService({
      request: vi.fn().mockResolvedValue({ type: "song", object: {} }),
    });

    await expect(
      apiErrorService.getSongBySpotifyId("id")
    ).rejects.toMatchObject({
      name: "SoundchartsApiError",
      message: "Not found",
    });
    await expect(
      incompleteService.getTrackAudioFeaturesBySpotifyId("id")
    ).rejects.toBeInstanceOf(SoundchartsApiError);
  });
});

function createSongResponse(): SoundchartsApiSongResponse {
  return {
    type: "song",
    object: {
      uuid: "soundcharts-uuid",
      audio: {
        acousticness: 0.2,
        danceability: 0.7,
        energy: 0.8,
        instrumentalness: 0.1,
        key: 4,
        liveness: 0.15,
        loudness: -5,
        mode: 1,
        speechiness: 0.05,
        tempo: 125,
        timeSignature: 4,
        valence: 0.65,
      },
    },
  } as SoundchartsApiSongResponse;
}
