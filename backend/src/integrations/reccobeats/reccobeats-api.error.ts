import { IntegrationApiError } from "../integration-api.error.js";

/** Fragment odpowiedzi błędu zwracanej przez API ReccoBeats. */
type ReccoBeatsApiErrorData = {
  /** Szczegóły błędu przekazane przez zewnętrzną usługę. */
  error?: {
    /** Komunikat opisujący przyczynę niepowodzenia. */
    message?: string;
    /** Status HTTP zapisany w treści odpowiedzi. */
    status?: number;
  };
};

/** Błąd nieudanego zapytania do API ReccoBeats. */
class ReccoBeatsApiError extends IntegrationApiError {
  /**
   * @param message - Czytelny opis niepowodzenia.
   * @param status - Status HTTP odpowiedzi ReccoBeats.
   * @param data - Oryginalne dane odpowiedzi błędu.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown
  ) {
    super("reccobeats", message, status, data);
    this.name = "ReccoBeatsApiError";
  }
}

export { ReccoBeatsApiError };
