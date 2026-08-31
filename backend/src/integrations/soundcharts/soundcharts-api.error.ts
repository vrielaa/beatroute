import { IntegrationApiError } from "../integration-api.error.js";

/** Błąd komunikacji lub niepoprawnej odpowiedzi API Soundcharts. */
class SoundchartsApiError extends IntegrationApiError {
  constructor(
    message: string,
    upstreamStatus: number | null = null,
    details: unknown = null
  ) {
    super("soundcharts", message, upstreamStatus, details);
    this.name = "SoundchartsApiError";
  }
}

export { SoundchartsApiError };
