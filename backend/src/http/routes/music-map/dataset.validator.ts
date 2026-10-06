import { MUSIC_MAP_FEATURE_KEYS } from "@domain/music-map/features.js";
import { RequestValidationError } from "@http/request-validation-error.js";
import { MAX_TRACKS_LIMIT } from "@integrations/spotify/spotify.validators.js";
import type {
  MusicMapDataset,
  MusicMapFeatureKey,
  MusicMapMetadata,
  MusicMapTrack,
  TrackAudioFeaturesLookup,
} from "@domain/music-map/types.js";

const MUSIC_MAP_TIME_RANGES = new Set([
  "short_term",
  "medium_term",
  "long_term",
]);
const MUSIC_MAP_FEATURE_KEY_SET = new Set<string>(MUSIC_MAP_FEATURE_KEYS);

/** Waliduje kompletny zbiór przesyłany ponownie do analizy domenowej. */
function parseMusicMapDataset(value: unknown): MusicMapDataset {
  const dataset = requireRecord(
    value,
    'Pole "dataset" musi być obiektem mapy muzycznej'
  );

  if (!Array.isArray(dataset.tracks)) {
    throw new RequestValidationError('Pole "dataset.tracks" musi być tablicą');
  }

  if (!Array.isArray(dataset.audioFeatures)) {
    throw new RequestValidationError(
      'Pole "dataset.audioFeatures" musi być tablicą'
    );
  }

  if (
    dataset.tracks.length > MAX_TRACKS_LIMIT ||
    dataset.audioFeatures.length > MAX_TRACKS_LIMIT
  ) {
    throw new RequestValidationError(
      `Zbiór mapy może zawierać maksymalnie ${MAX_TRACKS_LIMIT} utworów`
    );
  }

  const tracks = dataset.tracks.map(parseMusicMapTrack);
  const audioFeatures = dataset.audioFeatures.map(parseAudioFeaturesLookup);
  validateTrackRelationships(tracks, audioFeatures);

  return {
    tracks,
    audioFeatures,
    metadata: parseMusicMapMetadata(dataset.metadata),
  };
}

/** Sprawdza unikalność utworów i powiązanie cech z utworami zbioru. */
function validateTrackRelationships(
  tracks: MusicMapTrack[],
  audioFeatures: TrackAudioFeaturesLookup[]
): void {
  const trackIds = new Set(tracks.map((track) => track.id));

  if (trackIds.size !== tracks.length) {
    throw new RequestValidationError(
      'Pole "dataset.tracks" nie może zawierać powtórzonych identyfikatorów'
    );
  }

  const audioFeatureTrackIds = new Set<string>();

  for (const lookup of audioFeatures) {
    if (!trackIds.has(lookup.trackId)) {
      throw new RequestValidationError(
        "Cechy audio muszą należeć do utworu obecnego w zbiorze"
      );
    }

    if (audioFeatureTrackIds.has(lookup.trackId)) {
      throw new RequestValidationError(
        "Zbiór nie może zawierać kilku wyników cech dla jednego utworu"
      );
    }

    audioFeatureTrackIds.add(lookup.trackId);
  }
}

/** Waliduje dane opisowe pojedynczego utworu. */
function parseMusicMapTrack(value: unknown, index: number): MusicMapTrack {
  const track = requireRecord(
    value,
    `Element dataset.tracks[${index}] musi być obiektem`
  );

  if (!Array.isArray(track.artists) || !track.artists.length) {
    throw new RequestValidationError(
      `Pole dataset.tracks[${index}].artists musi być niepustą tablicą`
    );
  }

  return {
    id: requireNonEmptyString(track.id, `dataset.tracks[${index}].id`),
    name: requireNonEmptyString(track.name, `dataset.tracks[${index}].name`),
    artists: track.artists.map((artist, artistIndex) =>
      requireNonEmptyString(
        artist,
        `dataset.tracks[${index}].artists[${artistIndex}]`
      )
    ),
    album: parseNullableString(track.album, `dataset.tracks[${index}].album`),
    imageUrl: parseNullableString(
      track.imageUrl,
      `dataset.tracks[${index}].imageUrl`
    ),
    spotifyUrl: parseNullableString(
      track.spotifyUrl,
      `dataset.tracks[${index}].spotifyUrl`
    ),
  };
}

/** Waliduje znalezione cechy albo opis nieudanego wyszukania. */
function parseAudioFeaturesLookup(
  value: unknown,
  index: number
): TrackAudioFeaturesLookup {
  const lookup = requireRecord(
    value,
    `Element dataset.audioFeatures[${index}] musi być obiektem`
  );
  const trackId = requireNonEmptyString(
    lookup.trackId,
    `dataset.audioFeatures[${index}].trackId`
  );

  if (lookup.status === "failed") {
    return {
      status: "failed",
      trackId,
      reason: requireNonEmptyString(
        lookup.reason,
        `dataset.audioFeatures[${index}].reason`
      ),
    };
  }

  if (lookup.status !== "found") {
    throw new RequestValidationError(
      `Pole dataset.audioFeatures[${index}].status musi mieć wartość "found" albo "failed"`
    );
  }

  return {
    status: "found",
    trackId,
    features: parseAudioFeatureValues(lookup.features, index),
  };
}

/** Waliduje wartości liczbowe cech używanych przez analizę. */
function parseAudioFeatureValues(
  value: unknown,
  lookupIndex: number
): Partial<Record<MusicMapFeatureKey, number | null>> {
  const source = requireRecord(
    value,
    `Pole dataset.audioFeatures[${lookupIndex}].features musi być obiektem`
  );
  const features: Partial<Record<MusicMapFeatureKey, number | null>> = {};

  for (const key of Object.keys(source)) {
    if (!MUSIC_MAP_FEATURE_KEY_SET.has(key)) {
      throw new RequestValidationError(`Nieobsługiwana cecha audio: ${key}`);
    }
  }

  for (const featureKey of MUSIC_MAP_FEATURE_KEYS) {
    const featureValue = source[featureKey];

    if (featureValue === undefined) {
      continue;
    }

    if (
      featureValue !== null &&
      (typeof featureValue !== "number" || !Number.isFinite(featureValue))
    ) {
      throw new RequestValidationError(
        `Cecha ${featureKey} musi być skończoną liczbą albo wartością null`
      );
    }

    features[featureKey] = featureValue;
  }

  return features;
}

/** Waliduje metadane opisujące źródłowy wybór utworów. */
function parseMusicMapMetadata(value: unknown): MusicMapMetadata {
  const metadata = requireRecord(
    value,
    'Pole "dataset.metadata" musi być obiektem'
  );

  if (
    typeof metadata.timeRange !== "string" ||
    !MUSIC_MAP_TIME_RANGES.has(metadata.timeRange)
  ) {
    throw new RequestValidationError(
      'Pole "dataset.metadata.timeRange" ma nieobsługiwaną wartość'
    );
  }

  return {
    timeRange: metadata.timeRange as MusicMapMetadata["timeRange"],
    requestedLimit: parseCount(
      metadata.requestedLimit,
      "dataset.metadata.requestedLimit",
      1,
      MAX_TRACKS_LIMIT
    ),
    spotifyReturnedTracksCount: parseCount(
      metadata.spotifyReturnedTracksCount,
      "dataset.metadata.spotifyReturnedTracksCount"
    ),
    spotifyTotalTracksCount: parseCount(
      metadata.spotifyTotalTracksCount,
      "dataset.metadata.spotifyTotalTracksCount"
    ),
  };
}

/** Wymaga obiektu innego niż tablica. */
function requireRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(message);
  }

  return value as Record<string, unknown>;
}

/** Wymaga niepustego tekstu i usuwa otaczające białe znaki. */
function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(
      `Pole "${field}" musi być niepustym tekstem`
    );
  }

  return value.trim();
}

/** Waliduje opcjonalny tekst, który może mieć wartość `null`. */
function parseNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireNonEmptyString(value, field);
}

/** Waliduje nieujemny licznik w opcjonalnie ograniczonym zakresie. */
function parseCount(
  value: unknown,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RequestValidationError(
      `Pole "${field}" musi być liczbą całkowitą od ${minimum} do ${maximum}`
    );
  }

  return value;
}

export { parseMusicMapDataset };
