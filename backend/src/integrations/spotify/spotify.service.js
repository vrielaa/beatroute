export class SpotifyApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.data = data;
  }
}

export function createSpotifyService({
  fetchImpl = globalThis.fetch,
  apiRoot = "https://api.spotify.com/v1",
} = {}) {
  async function request(endpoint, accessToken, errorMessage) {
    const response = await fetchImpl(`${apiRoot}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new SpotifyApiError(
        data?.error?.message || errorMessage,
        response.status,
        data
      );
    }

    return data;
  }

  async function getSpotifyTrackById(spotifyTrackId, accessToken) {
    return request(
      `/tracks/${encodeURIComponent(spotifyTrackId)}`,
      accessToken,
      "Nie udało się pobrać utworu ze Spotify"
    );
  }

  async function getCurrentUserTopTracks(accessToken, { limit, timeRange }) {
    const params = new URLSearchParams({
      limit: String(limit),
      time_range: timeRange,
    });

    return request(
      `/me/top/tracks?${params.toString()}`,
      accessToken,
      "Nie udało się pobrać top tracks ze Spotify"
    );
  }

  async function getCurrentUserTopArtists(accessToken, { limit, timeRange }) {
    const params = new URLSearchParams({
      limit: String(limit),
      time_range: timeRange,
    });

    return request(
      `/me/top/artists?${params.toString()}`,
      accessToken,
      "Nie udało się pobrać top artists ze Spotify"
    );
  }

  async function getCurrentUserProfile(accessToken) {
    return request(
      "/me",
      accessToken,
      "Nie udało się pobrać profilu użytkownika ze Spotify"
    );
  }

  return {
    getSpotifyTrackById,
    getCurrentUserTopTracks,
    getCurrentUserTopArtists,
    getCurrentUserProfile,
  };
}

const defaultSpotifyService = createSpotifyService();

export const getSpotifyTrackById = defaultSpotifyService.getSpotifyTrackById;
export const getCurrentUserTopTracks =
  defaultSpotifyService.getCurrentUserTopTracks;
export const getCurrentUserTopArtists =
  defaultSpotifyService.getCurrentUserTopArtists;
export const getCurrentUserProfile =
  defaultSpotifyService.getCurrentUserProfile;

export function mapSpotifyTrackForLastfm(spotifyTrack) {
  const artist = spotifyTrack?.artists?.[0]?.name;
  const track = spotifyTrack?.name;

  if (!artist || !track) {
    throw new Error("Spotify nie zwrócił nazwy artysty lub utworu");
  }

  return {
    artist,
    track,
    album: spotifyTrack.album?.name || undefined,
    albumArtist: spotifyTrack.album?.artists?.[0]?.name || undefined,
    duration: spotifyTrack.duration_ms
      ? Math.round(spotifyTrack.duration_ms / 1000)
      : undefined,
    trackNumber: spotifyTrack.track_number || undefined,
  };
}

export function mapSpotifyTrackResponse(spotifyTrack) {
  return {
    id: spotifyTrack.id,
    name: spotifyTrack.name,
    artists: (spotifyTrack.artists ?? []).map((artist) => artist.name),
    album: spotifyTrack.album?.name ?? null,
    durationMs: spotifyTrack.duration_ms ?? null,
    spotifyUrl: spotifyTrack.external_urls?.spotify ?? null,
  };
}
