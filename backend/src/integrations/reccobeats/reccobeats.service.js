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
  console.log('[ReccoBeats service] getTracksByIds ids:', ids);

  return fetchFromReccoBeats(`/v1/track?${query}`);
}

export async function getTrackAudioFeaturesByReccoBeatsId(trackId) {
  console.log('[ReccoBeats service] getTrackAudioFeaturesByReccoBeatsId:', trackId);

  const data = await fetchFromReccoBeats(`/v1/track/${trackId}/audio-features`);

  console.log('[ReccoBeats service] raw audio features data:', data);

  return mapReccoBeatsAudioFeatures(data);
}

export async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId) {
  console.log('[ReccoBeats service] spotifyTrackId:', spotifyTrackId);

  const tracksResponse = await getTracksByIds([spotifyTrackId]);
  console.log('[ReccoBeats service] tracksResponse:', tracksResponse);

  const tracks = normalizeTracksResponse(tracksResponse);
  console.log('[ReccoBeats service] normalized tracks:', tracks);

  const track = tracks[0] ?? null;
  console.log('[ReccoBeats service] matched track:', track);

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
  console.log('[ReccoBeats service] getManyTrackAudioFeaturesBySpotifyIds input:', spotifyTrackIds);

  const tracksResponse = await getTracksByIds(spotifyTrackIds);
  console.log('[ReccoBeats service] tracksResponse bulk:', tracksResponse);

  const tracks = normalizeTracksResponse(tracksResponse);
  console.log('[ReccoBeats service] normalized tracks:', tracks);

  const idMap = new Map();

  for (const track of tracks) {
    const spotifyId = getSpotifyIdFromHref(track?.href);

    if (spotifyId && track?.id) {
      idMap.set(spotifyId, track.id);
    }
  }

  console.log('[ReccoBeats service] idMap:', Array.from(idMap.entries()));

  const results = await Promise.all(
    spotifyTrackIds.map(async (spotifyId) => {
      const reccoBeatsId = idMap.get(spotifyId);

      console.log(
        '[ReccoBeats service] processing spotifyId:',
        spotifyId,
        '-> reccoBeatsId:',
        reccoBeatsId,
      );

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

  console.log('[ReccoBeats service] final results:', results);

  return results;
}

function getSpotifyIdFromHref(href) {
  if (!href) {
    return null;
  }

  const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  return match?.[1] ?? null;
}