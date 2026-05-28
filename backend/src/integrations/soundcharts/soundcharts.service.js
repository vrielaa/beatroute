import { fetchFromSoundcharts } from "./soundcharts.client.js";

export async function getSongBySpotifyId(spotifyTrackId) {
  return fetchFromSoundcharts(
    `/api/v2.25/song/by-platform/spotify/${spotifyTrackId}`
  );
}

export async function getSongMetadataByUuid(uuid) {
  return fetchFromSoundcharts(`/api/v2.25/song/${uuid}`);
}

export async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId) {
  const song = await getSongBySpotifyId(spotifyTrackId);

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
