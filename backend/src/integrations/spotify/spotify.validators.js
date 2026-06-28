export const ALLOWED_TIME_RANGES = ["short_term", "medium_term", "long_term"];
export const DEFAULT_TIME_RANGE = "medium_term";
export const DEFAULT_TOP_ITEMS_LIMIT = 10;
export const MAX_TRACKS_LIMIT = 40;
export const MAX_ARTISTS_LIMIT = 40;

export class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function isRequestValidationError(error) {
  return error instanceof RequestValidationError;
}

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value, maxLimit) {
  const rawLimit = getSingleQueryValue(value);

  if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
    return DEFAULT_TOP_ITEMS_LIMIT;
  }

  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new RequestValidationError(`limit musi być liczbą całkowitą od 1 do ${maxLimit}`);
  }

  return limit;
}

function parseTimeRange(value) {
  const rawTimeRange = getSingleQueryValue(value) || DEFAULT_TIME_RANGE;

  if (!ALLOWED_TIME_RANGES.includes(rawTimeRange)) {
    throw new RequestValidationError(
      `time_range musi być jedną z wartości: ${ALLOWED_TIME_RANGES.join(", ")}`
    );
  }

  return rawTimeRange;
}

export function parseSpotifyTopItemsQuery(query, { maxLimit }) {
  return {
    limit: parseLimit(query.limit, maxLimit),
    timeRange: parseTimeRange(query.time_range),
  };
}

export function parseTrackIds(body, { maxLimit = MAX_TRACKS_LIMIT } = {}) {
  const trackIds = body?.trackIds;

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    throw new RequestValidationError("trackIds musi być niepustą tablicą");
  }

  if (trackIds.length > maxLimit) {
    throw new RequestValidationError(`trackIds może zawierać maksymalnie ${maxLimit} utworów`);
  }

  return trackIds.map((trackId, index) => {
    if (typeof trackId !== "string" || trackId.trim().length === 0) {
      throw new RequestValidationError(`trackIds[${index}] musi być niepustym stringiem`);
    }

    return trackId.trim();
  });
}
