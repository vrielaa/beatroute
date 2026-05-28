export function mapSoundchartsAudioFeatures(audioFeatures) {
  return {
    acousticness: audioFeatures.acousticness ?? null,
    danceability: audioFeatures.danceability ?? null,
    energy: audioFeatures.energy ?? null,
    instrumentalness: audioFeatures.instrumentalness ?? null,
    liveness: audioFeatures.liveness ?? null,
    loudness: audioFeatures.loudness ?? null,
    speechiness: audioFeatures.speechiness ?? null,
    tempo: audioFeatures.tempo ?? null,
    valence: audioFeatures.valence ?? null,
    key: audioFeatures.key ?? null,
    mode: audioFeatures.mode ?? null,
    timeSignature: audioFeatures.time_signature ?? null,
  };
}
