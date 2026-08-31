import { ReccoBeatsAudioFeatures } from "./reccobeats.types.js";

/**
 * Normalizuje cechy audio ReccoBeats do kompletnego obiektu aplikacji.
 * Brakujące wartości zewnętrznego API zastępuje wartością `null`.
 *
 * @param audio - Surowe cechy audio zwrócone przez ReccoBeats.
 * @returns Cechy audio z jawną wartością dla każdego obsługiwanego pola.
 */
function mapReccoBeatsAudioFeatures(audio: ReccoBeatsAudioFeatures) {
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

export { mapReccoBeatsAudioFeatures };
