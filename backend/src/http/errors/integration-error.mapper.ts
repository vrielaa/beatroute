import { IntegrationApiError } from "@integrations/integration-api.error.js";
import { createErrorResponse } from "./error-response.js";
import type { MappedHttpError } from "./types.js";

/** Mapuje wspólny błąd integracji na publiczną odpowiedź HTTP. */
function mapIntegrationError(error: IntegrationApiError): MappedHttpError {
  const status = getIntegrationHttpStatus(error);
  const code = `${error.integration.replace("-", "_").toUpperCase()}_API_ERROR`;
  const retryAfterDetails =
    error.retryAfterSeconds === null
      ? {}
      : { retryAfterSeconds: error.retryAfterSeconds };

  return {
    status,
    body: createErrorResponse(code, error.message, {
      integration: error.integration,
      upstreamStatus: error.upstreamStatus,
      ...(error.upstreamCode === null
        ? {}
        : { upstreamCode: error.upstreamCode }),
      ...retryAfterDetails,
    }),
    ...(error.retryAfterSeconds === null
      ? {}
      : { headers: { "Retry-After": String(error.retryAfterSeconds) } }),
  };
}

/** Wyznacza status zwracany klientowi dla błędu zewnętrznej usługi. */
function getIntegrationHttpStatus(error: IntegrationApiError): number {
  switch (error.category) {
    case "authentication":
      return 401;
    case "authorization":
      return 403;
    case "configuration":
    case "unavailable":
      return 503;
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    case "request-rejected":
      return error.upstreamStatus !== null &&
        error.upstreamStatus >= 400 &&
        error.upstreamStatus < 500
        ? error.upstreamStatus
        : 502;
    case "network":
    case "invalid-response":
    case "upstream-error":
      return 502;
  }
}

export { mapIntegrationError };
