import { appConfig } from "../../config/app.config.js";
import {
  type SoundchartsApiResponse,
  type SoundchartsApiErrorResponse,
} from "./types.js";
import { SoundchartsApiError } from "./soundcharts-api.error.js";

/** Zależności klienta Soundcharts możliwe do zastąpienia w testach. */
type SoundchartsClientConfiguration = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  appId?: string;
  apiKey?: string;
};

function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.soundcharts.baseUrl,
  appId = appConfig.soundcharts.appId,
  apiKey = appConfig.soundcharts.apiKey,
}: SoundchartsClientConfiguration = {}) {
  return async function fetchFromSoundcharts(
    endpointPath: string
  ): Promise<SoundchartsApiResponse> {
    let response: Response;

    try {
      response = await fetchImpl(`${baseUrl}${endpointPath}`, {
        headers: {
          "x-app-id": appId,
          "x-api-key": apiKey,
          Accept: "application/json",
        },
      });
    } catch (cause) {
      throw new SoundchartsApiError(
        "Nie udało się połączyć z Soundcharts",
        null,
        cause
      );
    }

    let data: SoundchartsApiResponse;

    try {
      data = (await response.json()) as SoundchartsApiResponse;
    } catch (cause) {
      throw new SoundchartsApiError(
        "Soundcharts zwrócił odpowiedź inną niż JSON",
        response.status,
        cause
      );
    }

    if (!response.ok) {
      const errorData = data as SoundchartsApiErrorResponse;

      throw new SoundchartsApiError(
        errorData.errors?.[0]?.message || "Soundcharts request failed",
        response.status,
        data
      );
    }

    return data;
  };
}

const fetchFromSoundcharts = createSoundchartsClient();

export { createSoundchartsClient, fetchFromSoundcharts };
export type { SoundchartsClientConfiguration };
