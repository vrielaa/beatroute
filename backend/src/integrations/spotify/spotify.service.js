export class SpotifyApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.data = data;
  }
}

export async function getSpotifyTrackById(spotifyTrackId, accessToken) {
  const response = await fetch(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(spotifyTrackId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new SpotifyApiError(
      data?.error?.message || "Nie udało się pobrać utworu ze Spotify",
      response.status,
      data
    );
  }

  return data;
}

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
