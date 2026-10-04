/** Błąd aplikacji przekształcony na publiczną odpowiedź HTTP. */
type MappedHttpError = {
  status: number;
  body: { error: { code: string; message: string; details?: unknown } };
  headers?: Record<string, string>;
};

export type { MappedHttpError };
