import { RECCOBEATS_BASE_URL } from "../../config/reccobeats.config.js";

export function createReccoBeatsClient({
  fetchImpl = globalThis.fetch,
  baseUrl = RECCOBEATS_BASE_URL,
} = {}) {
  return async function fetchFromReccoBeats(endpoint) {
    const url = `${baseUrl}${endpoint}`;

    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
      },
    });

    const rawText = await response.text();

    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (parseError) {
      console.error("[ReccoBeats] JSON parse error:", parseError);
      throw new Error(`ReccoBeats returned non-JSON response: ${rawText}`);
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          `ReccoBeats request failed with status ${response.status} and response: ${rawText}`
      );
    }

    return data;
  };
}

export const fetchFromReccoBeats = createReccoBeatsClient();
