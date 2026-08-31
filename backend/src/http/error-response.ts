import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { RequestValidationError } from "./request-validation-error.js";
import type { NextFunction, Request, Response } from "express";

class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function createErrorResponse(
  code: string,
  message: string,
  details?: unknown
): { error: { code: string; message: string; details?: unknown } } {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function mapErrorToHttp(error: unknown): {
  status: number;
  body: { error: { code: string; message: string; details?: unknown } };
} {
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

/** Mapuje wspólny błąd integracji na publiczną odpowiedź HTTP. */
function mapIntegrationError(error: IntegrationApiError) {
  const lastfmCode = getLastfmErrorCode(error);
  const status = getIntegrationHttpStatus(error, lastfmCode);
  const code = `${error.integration.replace("-", "_").toUpperCase()}_API_ERROR`;

  return {
    status,
    body: createErrorResponse(code, error.message, {
      integration: error.integration,
      upstreamStatus: error.upstreamStatus,
      ...(lastfmCode === null ? {} : { upstreamCode: lastfmCode }),
    }),
  };
}

/** Wyznacza status zwracany klientowi dla błędu zewnętrznej usługi. */
function getIntegrationHttpStatus(
  error: IntegrationApiError,
  lastfmCode: number | null
): number {
  if (error.integration === "lastfm") {
    return lastfmCode === 9 ? 401 : 502;
  }

  if (
    (error.integration === "spotify" || error.integration === "spotify-auth") &&
    error.upstreamStatus !== null
  ) {
    return error.upstreamStatus;
  }

  return 502;
}

/** Odczytuje liczbowy kod błędu Last.fm ze szczegółów integracji. */
function getLastfmErrorCode(error: IntegrationApiError): number | null {
  if (
    error.integration !== "lastfm" ||
    typeof error.details !== "object" ||
    error.details === null ||
    !("lastfmCode" in error.details)
  ) {
    return null;
  }

  const code = error.details.lastfmCode;

  return typeof code === "number" ? code : null;
}

function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json(createErrorResponse("ROUTE_NOT_FOUND", "Nie znaleziono trasy"));
}

function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const mappedError = mapErrorToHttp(error);

  if (mappedError.status >= 500) {
    console.error(error);
  }

  res.status(mappedError.status).json(mappedError.body);
}

export {
  HttpError,
  createErrorResponse,
  mapErrorToHttp,
  notFoundHandler,
  errorHandler,
};
