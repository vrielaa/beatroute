import { RequestValidationError } from "@http/request-validation-error.js";
import type { MusicMapSelection } from "@domain/music-map/types.js";
import {
  MAX_TRACKS_LIMIT,
  parseSpotifyTopItemsQuery,
} from "../../spotify/spotify.validators.js";

/** Parametry query obsługiwane przez endpoint mapy muzycznej. */
type MusicMapQuery = {
  limit?: unknown;
  time_range?: unknown;
  clusters?: unknown;
};

const DEFAULT_MUSIC_MAP_LIMIT = 40;
const DEFAULT_MUSIC_MAP_TIME_RANGE = "long_term";
const MIN_MUSIC_MAP_CLUSTER_COUNT = 2;
const MAX_MUSIC_MAP_CLUSTER_COUNT = 8;

/**
 * Waliduje parametry wyboru danych oraz liczby klastrów mapy muzycznej.
 * Brak limitu i okresu zastępuje wartościami odpowiednimi dla pełniejszej mapy.
 *
 * @param query - Parametry odczytane bezpośrednio z query żądania HTTP.
 * @returns Poprawny limit, okres historii i opcjonalna liczba klastrów.
 */
function parseMusicMapQuery(query: MusicMapQuery = {}): MusicMapSelection {
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

  return {
    limit,
    timeRange,
    clusterCount: parseClusterCount(query.clusters),
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

/**
 * Waliduje opcjonalną, ręcznie wybraną liczbę klastrów.
 *
 * @param value - Wartość parametru `clusters` odczytana z query.
 * @returns Liczba od 2 do 8 albo `null`, gdy użytkownik nie podał wartości.
 */
function parseClusterCount(value: unknown): number | null {
  if (Array.isArray(value)) {
    throw new RequestValidationError(
      'Parametr "clusters" może wystąpić tylko raz'
    );
  }

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidClusterCountError();
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const clusterCount = Number(normalizedValue);

  if (
    !Number.isInteger(clusterCount) ||
    clusterCount < MIN_MUSIC_MAP_CLUSTER_COUNT ||
    clusterCount > MAX_MUSIC_MAP_CLUSTER_COUNT
  ) {
    throw invalidClusterCountError();
  }

  return clusterCount;
}

/** Tworzy spójny błąd walidacji liczby klastrów. */
function invalidClusterCountError(): RequestValidationError {
  return new RequestValidationError(
    `Parametr "clusters" musi być liczbą całkowitą od ${MIN_MUSIC_MAP_CLUSTER_COUNT} do ${MAX_MUSIC_MAP_CLUSTER_COUNT}`
  );
}

export { parseMusicMapQuery };
