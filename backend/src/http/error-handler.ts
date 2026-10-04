import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { SpotifyAuthApiError } from "@integrations/spotify/auth/api-error.js";
import { RequestValidationError } from "./request-validation-error.js";
import { createErrorResponse } from "./errors/error-response.js";
import { HttpError } from "./errors/http-error.js";
import { mapIntegrationError } from "./errors/integration-error.mapper.js";
import { mapSpotifyAuthError } from "./errors/spotify-auth-error.mapper.js";
import type { MappedHttpError } from "./errors/types.js";
import type { NextFunction, Request, Response } from "express";

/** Przekształca błędy aplikacji na bezpieczny format odpowiedzi HTTP. */
function mapErrorToHttp(error: unknown): MappedHttpError {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: createErrorResponse(error.code, error.message, error.details),
    };
  }

  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      body: createErrorResponse("VALIDATION_ERROR", error.message),
    };
  }

  if (error instanceof SpotifyAuthApiError) {
    return mapSpotifyAuthError(error);
  }

  if (error instanceof IntegrationApiError) {
    return mapIntegrationError(error);
  }

  return {
    status: 500,
    body: createErrorResponse(
      "INTERNAL_SERVER_ERROR",
      "Wewnętrzny błąd serwera"
    ),
  };
}

/** Zwraca ujednolicony błąd dla nieistniejącej trasy. */
function notFoundHandler(_req: Request, res: Response) {
  res
    .status(404)
    .json(createErrorResponse("ROUTE_NOT_FOUND", "Nie znaleziono trasy"));
}

/** Końcowy middleware zwracający klientowi zmapowany błąd aplikacji. */
function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const mappedError = mapErrorToHttp(error);

  if (mappedError.status >= 500) {
    console.error(error);
  }

  if (mappedError.headers) {
    res.set(mappedError.headers);
  }

  res.status(mappedError.status).json(mappedError.body);
}

export { mapErrorToHttp, notFoundHandler, errorHandler };
