import { SpotifyApiError } from "../integrations/spotify/spotify.service.js";
import { RequestValidationError } from "../integrations/spotify/spotify.validators.js";

export function createErrorResponse(code, message, details) {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function mapErrorToHttp(error) {
  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      body: createErrorResponse("VALIDATION_ERROR", error.message),
    };
  }

  if (error instanceof SpotifyApiError) {
    return {
      status: error.status,
      body: createErrorResponse("SPOTIFY_API_ERROR", error.message, error.data),
    };
  }

  return {
    status: 500,
    body: createErrorResponse(
      "INTERNAL_SERVER_ERROR",
      "Wewnętrzny błąd serwera"
    ),
  };
}

export function notFoundHandler(req, res) {
  res
    .status(404)
    .json(createErrorResponse("ROUTE_NOT_FOUND", "Nie znaleziono trasy"));
}

export function errorHandler(error, req, res, next) {
  const mappedError = mapErrorToHttp(error);

  if (mappedError.status >= 500) {
    console.error(error);
  }

  res.status(mappedError.status).json(mappedError.body);
}
