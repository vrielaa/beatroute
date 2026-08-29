/** Fragment odpowiedzi błędu zwracanej przez API ReccoBeats. */
export type ReccoBeatsApiErrorData = {
  /** Szczegóły błędu przekazane przez zewnętrzną usługę. */
  error?: {
    /** Komunikat opisujący przyczynę niepowodzenia. */
    message?: string;
    /** Status HTTP zapisany w treści odpowiedzi. */
    status?: number;
  };
};

/** Błąd nieudanego zapytania do API ReccoBeats. */
export class ReccoBeatsApiError extends Error {
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
    super(message);
  }
}
