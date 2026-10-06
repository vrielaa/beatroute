import { RequestValidationError } from "@http/request-validation-error.js";
import {
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "@integrations/spotify/spotify.validators.js";
import { parseMusicMapDataset } from "./dataset.validator.js";
import type {
  MusicMapDataSelection,
  MusicMapDataset,
} from "@domain/music-map/types.js";

/** Parametry query endpointu pobierającego zbiór mapy muzycznej. */
type MusicMapDatasetQuery = {
  limit?: unknown;
  time_range?: unknown;
};

/** Dane wejściowe endpointu wykonującego analizę zapisanego zbioru. */
type MusicMapAnalysisInput = {
  dataset: MusicMapDataset;
  clusterCount: number | null;
};

const DEFAULT_MUSIC_MAP_LIMIT = 40;
const DEFAULT_MUSIC_MAP_TIME_RANGE = "long_term";
const MIN_MUSIC_MAP_CLUSTER_COUNT = 2;
const MAX_MUSIC_MAP_CLUSTER_COUNT = 8;

/**
 * Waliduje wybór danych pobieranych ze Spotify i ReccoBeats.
 * Brak wartości zastępuje ustawieniami odpowiednimi dla pełnej mapy.
 */
function parseMusicMapDatasetQuery(
  query: MusicMapDatasetQuery = {}
): MusicMapDataSelection {
  const { limit, timeRange } = parseSpotifyTopItemsQuery(
    {
      limit: withDefaultValue(query.limit, String(DEFAULT_MUSIC_MAP_LIMIT)),
      time_range: withDefaultValue(
        query.time_range,
        DEFAULT_MUSIC_MAP_TIME_RANGE
      ),
    },
    { maxLimit: MAX_TRACKS_LIMIT }
  );

  return { limit, timeRange };
}

/** Waliduje zbiór danych i liczbę klastrów przesłane do ponownej analizy. */
function parseMusicMapAnalysisBody(body: unknown): MusicMapAnalysisInput {
  const record = requireRecord(body, "Body analizy mapy musi być obiektem");

  return {
    dataset: parseMusicMapDataset(record.dataset),
    clusterCount: parseClusterCount(record.clusterCount),
  };
}

/** Zastępuje brakującą albo pustą wartość query wskazaną wartością domyślną. */
function withDefaultValue(value: unknown, defaultValue: string): unknown {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  ) {
    return defaultValue;
  }

  return value;
}

/** Waliduje ręcznie wybraną liczbę klastrów albo wybór automatyczny `null`. */
function parseClusterCount(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_MUSIC_MAP_CLUSTER_COUNT ||
    value > MAX_MUSIC_MAP_CLUSTER_COUNT
  ) {
    throw new RequestValidationError(
      `Pole "clusterCount" musi być liczbą całkowitą od ${MIN_MUSIC_MAP_CLUSTER_COUNT} do ${MAX_MUSIC_MAP_CLUSTER_COUNT} albo wartością null`
    );
  }

  return value;
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

export { parseMusicMapAnalysisBody, parseMusicMapDatasetQuery };
