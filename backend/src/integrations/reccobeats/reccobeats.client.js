import { RECCOBEATS_BASE_URL } from '../../config/reccobeats.config.js';

export async function fetchFromReccoBeats(endpoint) {
  const url = `${RECCOBEATS_BASE_URL}${endpoint}`;

  console.log('[ReccoBeats] request URL:', url);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const rawText = await response.text();

  console.log('[ReccoBeats] status:', response.status);
  console.log('[ReccoBeats] raw response:', rawText);

  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (parseError) {
    console.error('[ReccoBeats] JSON parse error:', parseError);
    throw new Error(`ReccoBeats returned non-JSON response: ${rawText}`);
  }

  if (!response.ok) {
    throw new Error(data?.message || `ReccoBeats request failed with status ${response.status}`);
  }

  return data;
}