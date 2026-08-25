import {
  SOUNDCHARTS_BASE_URL,
  SOUNDCHARTS_APP_ID,
  SOUNDCHARTS_API_KEY,
} from "../../config/soundcharts.config.js";

export function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = SOUNDCHARTS_BASE_URL,
  appId = SOUNDCHARTS_APP_ID,
  apiKey = SOUNDCHARTS_API_KEY,
} = {}) {
  return async function fetchFromSoundcharts(endpoint) {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      headers: {
        "x-app-id": appId,
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.errors?.[0]?.message || "Soundcharts request failed"
      );
    }

    return data;
  };
}

export const fetchFromSoundcharts = createSoundchartsClient();
