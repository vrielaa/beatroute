/** Błąd zgłaszany, gdy dane wejściowe żądania nie przechodzą walidacji. */
class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export { RequestValidationError };
