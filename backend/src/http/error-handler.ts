import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { SpotifyAuthApiError } from "@integrations/spotify/auth/api-error.js";
import { RequestValidationError } from "./request-validation-error.js";
import { createErrorResponse } from "./errors/error-response.js";
import { HttpError } from "./errors/http-error.js";
import { mapIntegrationError } from "./errors/integration-error.mapper.js";
import { mapSpotifyAuthError } from "./errors/spotify-auth-error.mapper.js";
import { mapRequestBodyError } from "./errors/request-body-error.mapper.js";
import type { MappedHttpError } from "./errors/types.js";
import type { NextFunction, Request, Response } from "express";

/**
 * Zamienia błąd przechwycony przez końcowy middleware Express na ujednoliconą
 * i bezpieczną odpowiedź HTTP.
 *
 * Rozpoznaje między innymi:
 *
 * - błędy walidacji żądania (`RequestValidationError`) – niepoprawne parametry
 *   query, parametry ścieżki albo dane przesłane w body;
 * - błędy parsera body Express (`entity.parse.failed`, `entity.too.large`) –
 *   niepoprawny JSON albo przekroczenie dozwolonego rozmiaru body;
 * - jawne błędy HTTP (`HttpError`) – celowo zgłoszone przypadki zawierające
 *   określony status, publiczny kod błędu i bezpieczny komunikat;
 * - błędy Spotify Accounts (`SpotifyAuthApiError`) – problemy z wymianą kodu,
 *   odświeżaniem tokenu, limitem zapytań albo dostępnością Spotify;
 * - błędy zewnętrznych integracji (`IntegrationApiError`) – problemy podczas
 *   komunikacji ze Spotify Web API, Last.fm, ReccoBeats lub Soundcharts;
 * - nieoczekiwane wyjątki – błędy nierozpoznane przez wcześniejsze warunki,
 *   zwracane klientowi jako ogólny błąd serwera.
 *
 * Dla rozpoznanego przypadku wybiera status HTTP, publiczny kod błędu,
 * bezpieczny komunikat oraz opcjonalne szczegóły i nagłówki odpowiedzi.
 * Nie ujawnia klientowi stack trace, poufnych danych ani technicznych
 * szczegółów nierozpoznanych błędów.
 *
 * @param error - Nieznany błąd przekazany do middleware obsługi błędów.
 * @returns Status, treść odpowiedzi i opcjonalne nagłówki HTTP.
 */
function mapErrorToHttp(error: unknown): MappedHttpError {
  const requestBodyError = mapRequestBodyError(error);

  if (requestBodyError !== null) {
    return requestBodyError;
  }

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
