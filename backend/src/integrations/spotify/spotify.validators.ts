import { RequestValidationError } from "@http/request-validation-error.js";
import type {
  SpotifyTimeRange,
  SpotifyTopItemsSelection,
} from "./spotify.types.js";

/**
 * Parametry URL obsługiwane przez endpointy list top Spotify.
 *
 * @property limit - Maksymalna liczba elementów na stronie.
 * @property time_range - Okres statystyk.
 * @property offset - Liczba pomijanych pozycji, obsługiwana przez top utwory.
 */
type SpotifyTopItemsQuery = {
  limit?: unknown;
  time_range?: unknown;
  offset?: unknown;
};

/** Górna granica liczby elementów przyjmowanych w jednym żądaniu. */
type ItemCountLimit = {
  /** Największa dozwolona liczba elementów. */
  maxLimit?: number;
};

/** Body żądania zbiorczego pobierania danych utworów. */
type TrackIdsRequestBody = {
  /** Identyfikatory utworów odczytane z treści żądania HTTP. */
  trackIds?: unknown;
};

const ALLOWED_TIME_RANGES: readonly SpotifyTimeRange[] = [
  "short_term",
  "medium_term",
  "long_term",
];
const DEFAULT_TIME_RANGE: SpotifyTimeRange = "medium_term";
const DEFAULT_TOP_ITEMS_LIMIT = 10;
const MAX_TRACKS_LIMIT = 40;
const MAX_ARTISTS_LIMIT = 40;

/**
 * Waliduje opcjonalny limit elementów przekazany w query.
 *
 * @param value - Wartość parametru `limit` odczytana z query żądania.
 * @param maxLimit - Największa akceptowana wartość.
 * @returns Poprawny limit lub wartość domyślna.
 */
function parseLimit(value: unknown, maxLimit: number): number {
  if (Array.isArray(value)) {
    throw new RequestValidationError(
      `Parametr "limit" może wystąpić tylko raz`
    );
  }

  if (value === undefined || value === null || value === "") {
    return DEFAULT_TOP_ITEMS_LIMIT;
  }

  if (typeof value !== "string") {
    throw invalidLimitError(maxLimit);
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return DEFAULT_TOP_ITEMS_LIMIT;
  }

  const limit = Number(normalizedValue);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw invalidLimitError(maxLimit);
  }

  return limit;
}

/**
 * Waliduje opcjonalny okres statystyk przekazany w query.
 *
 * @param value - Wartość parametru `time_range` odczytana z query żądania.
 * @returns Poprawny okres lub wartość domyślna.
 */
function parseTimeRange(value: unknown): SpotifyTimeRange {
  if (Array.isArray(value)) {
    throw new RequestValidationError(
      `Parametr "time_range" może wystąpić tylko raz`
    );
  }

  if (value === undefined || value === null || value === "") {
    return DEFAULT_TIME_RANGE;
  }

  if (typeof value !== "string") {
    throw invalidTimeRangeError();
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return DEFAULT_TIME_RANGE;
  }

  if (!isSpotifyTimeRange(normalizedValue)) {
    throw invalidTimeRangeError();
  }

  return normalizedValue;
}

/**
 * Waliduje query endpointu pobierającego najczęściej słuchane zasoby Spotify.
 *
 * @param query - Parametry query żądania HTTP.
 * @param limits - Opcjonalny maksymalny limit elementów.
 * @returns Limit oraz okres gotowe do przekazania do gatewaya Spotify.
 */
function parseSpotifyTopItemsQuery(
  query: SpotifyTopItemsQuery = {},
  { maxLimit = MAX_TRACKS_LIMIT }: ItemCountLimit = {}
): SpotifyTopItemsSelection {
  return {
    limit: parseLimit(query.limit, maxLimit),
    timeRange: parseTimeRange(query.time_range),
  };
}

/**
 * Waliduje rozmiar, okres i przesunięcie jednej strony top utworów.
 * Brak offsetu lub pusty parametr oznacza pierwszą stronę. Nie ustala liczby
 * dostępnych utworów; tę informację zawiera dopiero odpowiedź Spotify.
 *
 * @param query - Parametry query żądania HTTP.
 * @returns Wybór strony z limitem do 40 utworów i offsetem domyślnie równym 0.
 * @throws RequestValidationError Gdy parametr jest niepoprawny lub powtórzony.
 */
function parseSpotifyTopTracksQuery(
  query: SpotifyTopItemsQuery = {}
): SpotifyTopItemsSelection {
  return {
    ...parseSpotifyTopItemsQuery(query),
    offset: parseOffset(query.offset),
  };
}

/** Odczytuje nieujemny, bezpieczny całkowity offset; pustą wartość zastępuje zerem. */
function parseOffset(value: unknown): number {
  if (Array.isArray(value)) {
    throw new RequestValidationError(
      'Parametr "offset" może wystąpić tylko raz'
    );
  }

  if (value === undefined || value === null || value === "") {
    return 0;
  }

  if (typeof value === "string") {
    const offset = Number(value.trim());

    if (Number.isSafeInteger(offset) && offset >= 0) {
      return offset;
    }
  }

  throw new RequestValidationError(
    'Parametr "offset" musi być nieujemną, bezpieczną liczbą całkowitą'
  );
}

/**
 * Waliduje listę identyfikatorów utworów przesłaną w body żądania.
 *
 * @param body - Body żądania HTTP.
 * @param limits - Opcjonalna maksymalna liczba identyfikatorów.
 * @returns Przycięte, niepuste identyfikatory utworów.
 */
function parseTrackIds(
  body: TrackIdsRequestBody = {},
  { maxLimit = MAX_TRACKS_LIMIT }: ItemCountLimit = {}
): string[] {
  const trackIds = body.trackIds;

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    throw new RequestValidationError("trackIds musi być niepustą tablicą");
  }

  if (trackIds.length > maxLimit) {
    throw new RequestValidationError(
      `trackIds może zawierać maksymalnie ${maxLimit} utworów`
    );
  }

  return trackIds.map((trackId, index) => {
    if (typeof trackId !== "string" || trackId.trim().length === 0) {
      throw new RequestValidationError(
        `trackIds[${index}] musi być niepustym stringiem`
      );
    }

    return trackId.trim();
  });
}

/** Tworzy błąd informujący o niepoprawnym limicie elementów. */
function invalidLimitError(maxLimit: number): RequestValidationError {
  return new RequestValidationError(
    `Parametr "limit" musi być liczbą całkowitą od 1 do ${maxLimit}`
  );
}

/** Tworzy błąd informujący o niepoprawnym okresie statystyk. */
function invalidTimeRangeError(): RequestValidationError {
  return new RequestValidationError(
    `Parametr "time_range" musi być jedną z wartości: ${ALLOWED_TIME_RANGES.join(
      ", "
    )}`
  );
}

/** Sprawdza, czy tekst jest okresem obsługiwanym przez Spotify. */
function isSpotifyTimeRange(value: string): value is SpotifyTimeRange {
  return ALLOWED_TIME_RANGES.some((timeRange) => timeRange === value);
}

export {
  ALLOWED_TIME_RANGES,
  DEFAULT_TIME_RANGE,
  DEFAULT_TOP_ITEMS_LIMIT,
  MAX_TRACKS_LIMIT,
  MAX_ARTISTS_LIMIT,
  parseSpotifyTopItemsQuery,
  parseSpotifyTopTracksQuery,
  parseTrackIds,
};
