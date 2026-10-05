import { createErrorResponse } from "./error-response.js";
import type { MappedHttpError } from "./types.js";

type RequestBodyErrorType = "entity.parse.failed" | "entity.too.large";

/** Sprawdza, czy Express zgłosił wskazany błąd przetwarzania body. */
function hasRequestBodyErrorType(
  error: unknown,
  expectedType: RequestBodyErrorType
): boolean {
  return (
    error instanceof Error && "type" in error && error.type === expectedType
  );
}

/** Mapuje błędy express.json() na publiczną odpowiedź HTTP. */
function mapRequestBodyError(error: unknown): MappedHttpError | null {
  if (hasRequestBodyErrorType(error, "entity.parse.failed")) {
    return {
      status: 400,
      body: createErrorResponse(
        "INVALID_JSON",
        "Treść żądania nie jest poprawnym JSON-em"
      ),
    };
  }

  if (hasRequestBodyErrorType(error, "entity.too.large")) {
    return {
      status: 413,
      body: createErrorResponse(
        "PAYLOAD_TOO_LARGE",
        "Treść żądania przekracza dozwolony rozmiar"
      ),
    };
  }

  return null;
}

export { mapRequestBodyError };
