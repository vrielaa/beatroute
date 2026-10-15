import { RequestValidationError } from "@http/request-validation-error.js";
import { MAX_TRACKS_LIMIT } from "@integrations/spotify/spotify.validators.js";
import type { TrackAudioFeatures } from "@domain/tracks/types.js";

/** Waliduje do 40 zebranych pomiarów do lokalnego podsumowania; brak pola cechy oznacza null. */
function parseAudioFeaturesBody(value: unknown): TrackAudioFeatures[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("audioFeatures" in value) ||
    !Array.isArray(value.audioFeatures) ||
    value.audioFeatures.length > MAX_TRACKS_LIMIT
  ) {
    throw new RequestValidationError(
      'Pole "audioFeatures" musi być tablicą do 40 pomiarów'
    );
  }
  const ids = new Set<string>();
  return value.audioFeatures.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError("Każdy pomiar musi być obiektem");
    }
    const features = item as Record<string, unknown>;
    if ("error" in features) {
      throw new RequestValidationError(
        "Do podsumowania przekaż pomiary, nie błędy odczytu"
      );
    }
    const spotifyId = features.spotifyId;
    if (
      typeof spotifyId !== "string" ||
      !spotifyId.trim() ||
      ids.has(spotifyId.trim())
    ) {
      throw new RequestValidationError(
        "Pomiary muszą mieć unikalne, niepuste spotifyId"
      );
    }
    ids.add(spotifyId.trim());
    const measurement = (key: string): number | null => {
      const number = features[key] ?? null;
      if (
        number !== null &&
        (typeof number !== "number" || !Number.isFinite(number))
      ) {
        throw new RequestValidationError(
          `Pomiar ${key} musi być skończoną liczbą lub null`
        );
      }
      return number;
    };
    return {
      id: typeof features.id === "string" ? features.id : spotifyId.trim(),
      spotifyId: spotifyId.trim(),
      acousticness: measurement("acousticness"),
      danceability: measurement("danceability"),
      energy: measurement("energy"),
      instrumentalness: measurement("instrumentalness"),
      key: measurement("key"),
      liveness: measurement("liveness"),
      loudness: measurement("loudness"),
      mode: measurement("mode"),
      speechiness: measurement("speechiness"),
      tempo: measurement("tempo"),
      timeSignature: measurement("timeSignature"),
      valence: measurement("valence"),
    };
  });
}

export { parseAudioFeaturesBody };
