/** Nazwa zewnętrznej usługi, z którą komunikował się backend. */
type IntegrationName =
  "spotify" | "spotify-auth" | "lastfm" | "reccobeats" | "soundcharts";

/** Neutralne znaczenie błędu integracji rozpoznawane przez warstwę HTTP. */
type IntegrationErrorCategory =
  | "authentication"
  | "authorization"
  | "configuration"
  | "rate-limited"
  | "network"
  | "timeout"
  | "unavailable"
  | "invalid-response"
  | "request-rejected"
  | "upstream-error";

/** Typowane informacje opisujące błąd zewnętrznej usługi. */
type IntegrationApiErrorOptions = {
  /** Znaczenie błędu niezależne od formatu konkretnego API. */
  category?: IntegrationErrorCategory;
  /** Status HTTP zwrócony przez usługę, jeśli odpowiedź została odebrana. */
  upstreamStatus?: number | null;
  /** Kod błędu charakterystyczny dla usługi, na przykład kod Last.fm. */
  upstreamCode?: string | number | null;
  /** Dane przeznaczone wyłącznie do diagnostyki po stronie backendu. */
  details?: unknown;
};

/**
 * Wspólna baza błędów pochodzących z zewnętrznych API.
 * Przechowuje neutralną kategorię, dane odpowiedzi źródłowej i szczegóły
 * diagnostyczne, nie uzależniając integracji od Expressa.
 */
class IntegrationApiError extends Error {
  public readonly category: IntegrationErrorCategory;
  public readonly upstreamStatus: number | null;
  public readonly upstreamCode: string | number | null;
  public readonly details: unknown;

  constructor(
    public readonly integration: IntegrationName,
    message: string,
    options: IntegrationApiErrorOptions = {}
  ) {
    super(message);
    this.name = "IntegrationApiError";
    this.category = options.category ?? "upstream-error";
    this.upstreamStatus = options.upstreamStatus ?? null;
    this.upstreamCode = options.upstreamCode ?? null;
    this.details = options.details ?? null;
  }
}

export { IntegrationApiError };
export type {
  IntegrationName,
  IntegrationErrorCategory,
  IntegrationApiErrorOptions,
};
