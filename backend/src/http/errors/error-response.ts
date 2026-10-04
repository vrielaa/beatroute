/** Buduje wspólny, publiczny format błędu zwracanego przez API. */
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

export { createErrorResponse };
