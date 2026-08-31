import { fetchFromSoundcharts } from "./client.js";
import { mapSoundchartsAudioFeatures } from "./mapper.js";
import { SoundchartsApiError } from "./soundcharts-api.error.js";
import {
  type SoundchartsApiSongResponse,
  type SoundchartsApiResponse,
} from "./types.js";

type SoundchartsServiceDependencies = {
  request: (endpointPath: string) => Promise<SoundchartsApiResponse>;
};

/** Tworzy serwis mapujący odpowiedzi Soundcharts na dane aplikacji. */
function createSoundchartsService({ request }: SoundchartsServiceDependencies) {
  async function getSongBySpotifyId(
    spotifyTrackId: string
  ): Promise<SoundchartsApiSongResponse> {
    return requestSong(
      `/api/v2.25/song/by-platform/spotify/${encodeURIComponent(spotifyTrackId)}`
    );
  }

  async function getSongMetadataByUuid(
    uuid: string
  ): Promise<SoundchartsApiSongResponse> {
    return requestSong(`/api/v2.25/song/${encodeURIComponent(uuid)}`);
  }

  async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId: string) {
    const song = await getSongBySpotifyId(spotifyTrackId);
    const songData = song.object;

    if (!songData || typeof songData !== "object") {
      throw new SoundchartsApiError(
        "Soundcharts zwrócił niepoprawne dane utworu"
      );
    }

    const { uuid, audio } = songData;

    if (!uuid) {
      throw new SoundchartsApiError("Soundcharts nie zwrócił UUID utworu");
    }

    if (!audio) {
      throw new SoundchartsApiError(
        "Soundcharts nie zwrócił cech audio utworu"
      );
    }

    return {
      uuid,
      ...mapSoundchartsAudioFeatures(audio),
    };
  }

  async function requestSong(
    endpointPath: string
  ): Promise<SoundchartsApiSongResponse> {
    const response = await request(endpointPath);

    if (!response || typeof response !== "object") {
      throw new SoundchartsApiError(
        "Soundcharts zwrócił niepoprawną odpowiedź"
      );
    }

    if ("errors" in response) {
      throw new SoundchartsApiError(
        response.errors[0]?.message || "Soundcharts request failed",
        null,
        response
      );
    }

    return response;
  }

  return {
    getSongBySpotifyId,
    getSongMetadataByUuid,
    getTrackAudioFeaturesBySpotifyId,
  };
}

const soundchartsService = createSoundchartsService({
  request: fetchFromSoundcharts,
});

const {
  getSongBySpotifyId,
  getSongMetadataByUuid,
  getTrackAudioFeaturesBySpotifyId,
} = soundchartsService;

export {
  getSongBySpotifyId,
  getSongMetadataByUuid,
  getTrackAudioFeaturesBySpotifyId,
  createSoundchartsService,
};
export type { SoundchartsServiceDependencies };
