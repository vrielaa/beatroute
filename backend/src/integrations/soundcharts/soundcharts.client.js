import { appConfig } from "../../config/app.config.js";

export function createSoundchartsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = appConfig.soundcharts.baseUrl,
  appId = appConfig.soundcharts.appId,
  apiKey = appConfig.soundcharts.apiKey,
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
