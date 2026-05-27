import { fetchFromReccoBeats } from './reccobeats.client.js';
import { mapReccoBeatsAudioFeatures } from './reccobeats.mapper.js';

function normalizeTracksResponse(tracksResponse) {
  if (Array.isArray(tracksResponse)) {
    return tracksResponse;
  }

  if (Array.isArray(tracksResponse?.content)) {
    return tracksResponse.content;
  }

  if (Array.isArray(tracksResponse?.items)) {
    return tracksResponse.items;
  }

  if (tracksResponse?.object && Array.isArray(tracksResponse.object)) {
    return tracksResponse.object;
  }

  if (tracksResponse?.object && Array.isArray(tracksResponse.object?.items)) {
    return tracksResponse.object.items;
  }

  return [];
}

export async function getTracksByIds(ids) {
  const query = ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&');

  return fetchFromReccoBeats(`/v1/track?${query}`);
}

export async function getTrackAudioFeaturesByReccoBeatsId(trackId) {
  const data = await fetchFromReccoBeats(`/v1/track/${trackId}/audio-features`);

  return mapReccoBeatsAudioFeatures(data);
}

export async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId) {
  const tracksResponse = await getTracksByIds([spotifyTrackId]);

  const tracks = normalizeTracksResponse(tracksResponse);

  const track = tracks[0] ?? null;

  const reccoBeatsId = track?.id;

  if (!reccoBeatsId) {
    throw new Error(`ReccoBeats track not found for Spotify ID: ${spotifyTrackId}`);
  }

  const audio = await getTrackAudioFeaturesByReccoBeatsId(reccoBeatsId);

  return {
    id: reccoBeatsId,
    spotifyId: spotifyTrackId,
    ...audio,
  };
}

export async function getManyTrackAudioFeaturesBySpotifyIds(spotifyTrackIds) {
  const tracksResponse = await getTracksByIds(spotifyTrackIds);

  const tracks = normalizeTracksResponse(tracksResponse);

  const idMap = new Map();

  for (const track of tracks) {
    const spotifyId = getSpotifyIdFromHref(track?.href);

    if (spotifyId && track?.id) {
      idMap.set(spotifyId, track.id);
    }
  }

  const results = await Promise.all(
    spotifyTrackIds.map(async (spotifyId) => {
      const reccoBeatsId = idMap.get(spotifyId);

      if (!reccoBeatsId) {
        return {
          spotifyId,
          error: 'ReccoBeats track not found',
        };
      }

      try {
        const audio = await getTrackAudioFeaturesByReccoBeatsId(reccoBeatsId);

        return {
          id: reccoBeatsId,
          spotifyId,
          ...audio,
        };
      } catch (error) {
        console.error('[ReccoBeats service] audio fetch error for', spotifyId, error);

        return {
          spotifyId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
  );

  return results;
}

function getSpotifyIdFromHref(href) {
  if (!href) {
    return null;
  }

  const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  return match?.[1] ?? null;
}