/** Nazwa zewnętrznej usługi, z którą komunikował się backend. */
type IntegrationName =
  "spotify" | "spotify-auth" | "lastfm" | "reccobeats" | "soundcharts";

/**
 * Wspólna baza błędów pochodzących z zewnętrznych API.
 * Przechowuje usługę, status odpowiedzi i bezpieczne szczegóły potrzebne
 * centralnemu handlerowi HTTP, nie uzależniając integracji od Expressa.
 */
class IntegrationApiError extends Error {
  constructor(
    public readonly integration: IntegrationName,
    message: string,
    public readonly upstreamStatus: number | null = null,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = "IntegrationApiError";
  }
}

export { IntegrationApiError };
export type { IntegrationName };
