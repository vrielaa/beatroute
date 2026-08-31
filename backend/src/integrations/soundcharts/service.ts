import { fetchFromSoundcharts } from "./client.js";
import {
  type SoundchartsApiSongResponse,
  type SoundchartsApiErrorResponse,
} from "./types.js";

async function getSongBySpotifyId(
  spotifyTrackId: string
): Promise<SoundchartsApiSongResponse | SoundchartsApiErrorResponse> {
  return fetchFromSoundcharts(
    `/api/v2.25/song/by-platform/spotify/${spotifyTrackId}`
  );
}

async function getSongMetadataByUuid(uuid: string) {
  return fetchFromSoundcharts(`/api/v2.25/song/${uuid}`);
}

async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId: string) {
  const song = await getSongBySpotifyId(spotifyTrackId);

  if ("errors" in song) {
    throw new Error(song?.errors?.[0]?.message || "Soundcharts request failed");
  }

  const uuid = song?.object?.uuid;
  const audio = song?.object?.audio;

  if (!uuid) {
    throw new Error("Soundcharts UUID not found");
  }

  if (!audio) {
    throw new Error("Soundcharts audio features not found");
  }

  return {
    uuid,
    acousticness: audio.acousticness ?? null,
    danceability: audio.danceability ?? null,
    energy: audio.energy ?? null,
    instrumentalness: audio.instrumentalness ?? null,
    key: audio.key ?? null,
    liveness: audio.liveness ?? null,
    loudness: audio.loudness ?? null,
    mode: audio.mode ?? null,
    speechiness: audio.speechiness ?? null,
    tempo: audio.tempo ?? null,
    timeSignature: audio.timeSignature ?? null,
    valence: audio.valence ?? null,
  };
}

export {
  getSongBySpotifyId,
  getSongMetadataByUuid,
  getTrackAudioFeaturesBySpotifyId,
};
