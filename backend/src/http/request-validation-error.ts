/** Błąd zgłaszany, gdy dane wejściowe żądania nie przechodzą walidacji. */
export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}
