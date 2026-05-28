import {
  SOUNDCHARTS_BASE_URL,
  SOUNDCHARTS_APP_ID,
  SOUNDCHARTS_API_KEY,
} from "../../config/soundcharts.config.js";

export async function fetchFromSoundcharts(endpoint) {
  const response = await fetch(`${SOUNDCHARTS_BASE_URL}${endpoint}`, {
    headers: {
      "x-app-id": SOUNDCHARTS_APP_ID,
      "x-api-key": SOUNDCHARTS_API_KEY,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || "Soundcharts request failed");
  }

  return data;
}
