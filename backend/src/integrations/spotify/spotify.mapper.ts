import type { LastfmTrackIdentifier } from "../lastfm/track/types.js";
import type {
  SpotifyTrackApiResponse,
  SpotifyTrackSummary,
} from "./spotify.types.js";

/**
 * Mapuje utwór Spotify na identyfikator tekstowy akceptowany przez Last.fm.
 *
 * @param spotifyTrack - Utwór zwrócony przez Spotify Web API.
 * @returns Nazwa pierwszego wykonawcy oraz nazwa utworu.
 * @throws {Error} Gdy odpowiedź nie zawiera wykonawcy lub nazwy utworu.
 */
export function mapSpotifyTrackForLastfm(
  spotifyTrack: SpotifyTrackApiResponse
): LastfmTrackIdentifier {
  const artist = spotifyTrack.artists[0]?.name;
  const track = spotifyTrack.name;

  if (!artist || !track) {
    throw new Error("Spotify nie zwrócił nazwy artysty lub utworu");
  }

  return {
    artist,
    track,
  };
}

/**
 * Mapuje rozbudowaną odpowiedź Spotify na skrót zwracany przez aplikację.
 *
 * @param spotifyTrack - Utwór zwrócony przez Spotify Web API.
 * @returns Najważniejsze dane utworu przeznaczone dla frontendu.
 */
export function mapSpotifyTrackResponse(
  spotifyTrack: SpotifyTrackApiResponse
): SpotifyTrackSummary {
  return {
    id: spotifyTrack.id,
    name: spotifyTrack.name,
    artists: spotifyTrack.artists.map((artist) => artist.name),
    album: spotifyTrack.album?.name ?? null,
    durationMs: spotifyTrack.duration_ms ?? null,
    spotifyUrl: spotifyTrack.external_urls?.spotify ?? null,
  };
}
