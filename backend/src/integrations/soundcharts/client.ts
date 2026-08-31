import { appConfig } from "../../config/app.config.js";
import {
  type SoundchartsApiResponse,
  type SoundchartsApiErrorResponse,
} from "./types.js";

function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.soundcharts.baseUrl,
  appId = appConfig.soundcharts.appId,
  apiKey = appConfig.soundcharts.apiKey,
} = {}) {
  return async function fetchFromSoundcharts(endpointPath: string) {
    const response = await fetchImpl(`${baseUrl}${endpointPath}`, {
      headers: {
        "x-app-id": appId,
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    const data = (await response.json()) as SoundchartsApiResponse;

    if (!response.ok) {
      if (data as SoundchartsApiErrorResponse) {
        const errorData = data as SoundchartsApiErrorResponse;

        throw new Error(
          errorData?.errors?.[0]?.message || "Soundcharts request failed"
        );
      }
    }

    return data;
  };
}

const fetchFromSoundcharts = createSoundchartsClient();

export { createSoundchartsClient, fetchFromSoundcharts };
