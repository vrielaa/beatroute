export function mapReccoBeatsAudioFeatures(audio) {
  return {
    acousticness: audio?.acousticness ?? null,
    danceability: audio?.danceability ?? null,
    energy: audio?.energy ?? null,
    instrumentalness: audio?.instrumentalness ?? null,
    key: audio?.key ?? null,
    liveness: audio?.liveness ?? null,
    loudness: audio?.loudness ?? null,
    mode: audio?.mode ?? null,
    speechiness: audio?.speechiness ?? null,
    tempo: audio?.tempo ?? null,
    timeSignature: audio?.timeSignature ?? null,
    valence: audio?.valence ?? null,
  };
}