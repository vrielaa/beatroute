import { normalizeLastfmTags } from "../genre-classifier.js";
import type {
  LastfmTrackApiResponse,
  LastfmTrackMetadata,
  LastfmTrackTopTagsApiResponse,
} from "./types.js";
import type { LastfmTag } from "../types.js";

/**
 * Mapuje odpowiedź `track.getInfo` na metadane używane przez aplikację.
 * Nazwa artysty z Last.fm ma pierwszeństwo przed nazwą z zapytania.
 *
 * @param response - Surowa odpowiedź metody `track.getInfo`.
 * @param requestedArtist - Nazwa artysty przekazana w zapytaniu, jeśli istnieje.
 * @returns Znormalizowane metadane i tagi utworu.
 */
function mapLastfmTrackMetadata(
  response: LastfmTrackApiResponse,
  requestedArtist: string | null
): LastfmTrackMetadata {
  return {
    name: response.track?.name ?? null,
    artist: response.track?.artist?.name ?? requestedArtist,
    mbid: response.track?.mbid || null,
    url: response.track?.url ?? null,
    tags: normalizeLastfmTags(response.track?.toptags?.tag),
  };
}

/**
 * Wyciąga i normalizuje tagi z odpowiedzi `track.getTopTags`.
 *
 * @param response - Surowa odpowiedź metody `track.getTopTags`.
 * @returns Znormalizowane tagi w kolejności zwróconej przez Last.fm.
 */
function mapLastfmTrackTopTags(
  response: LastfmTrackTopTagsApiResponse
): LastfmTag[] {
  return normalizeLastfmTags(response.toptags?.tag);
}

export { mapLastfmTrackMetadata, mapLastfmTrackTopTags };
