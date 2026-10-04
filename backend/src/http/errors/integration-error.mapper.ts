import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { createErrorResponse } from "./error-response.js";
import type { MappedHttpError } from "./types.js";

/** Mapuje wspólny błąd integracji na publiczną odpowiedź HTTP. */
function mapIntegrationError(error: IntegrationApiError): MappedHttpError {
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

export { mapIntegrationError };
