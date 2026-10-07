import { mapLastfmTrackMetadata, mapLastfmTrackTopTags } from "./mapper.js";
import { fetchFromLastfm } from "../lastfm.client.js";
import type { LastfmTrackReader } from "@application/lastfm/track-info.js";
import type { LastfmTrackIdentifier } from "@application/lastfm/types.js";
import type {
  LastfmTrackServiceDependencies,
  LastfmTrackRequestParams,
} from "./types.js";

/**
 * Tworzy adapter pobierający metadane i tagi utworu z Last.fm.
 * Buduje parametry dla wybranego identyfikatora i mapuje odpowiedzi API
 * na modele używane przez warstwę aplikacyjną.
 *
 * @param dependencies - Adaptery metod `track.getInfo` i `track.getTopTags`.
 * @returns Operacje pobierania znormalizowanych metadanych i tagów.
 */
function createLastfmTrackService({
  fetchTrackInfo,
  fetchTrackTopTags,
}: LastfmTrackServiceDependencies): LastfmTrackReader {
  /** Pobiera metadane i tagi osadzone w odpowiedzi `track.getInfo`. */
  async function getTrackMetadata(identifier: LastfmTrackIdentifier) {
    const response = await fetchTrackInfo(createRequestParams(identifier));
    return mapLastfmTrackMetadata(response, identifier.artist ?? null);
  }

  /** Pobiera tagi z osobnej metody `track.getTopTags`. */
  async function getTrackTopTags(identifier: LastfmTrackIdentifier) {
    const response = await fetchTrackTopTags(createRequestParams(identifier));
    return mapLastfmTrackTopTags(response);
  }

  return { getTrackMetadata, getTrackTopTags };
}

/** Buduje parametry MBID albo artysta–utwór z włączoną autokorektą nazw. */
function createRequestParams(
  identifier: LastfmTrackIdentifier
): LastfmTrackRequestParams {
  if (identifier.mbid !== undefined) {
    return { mbid: identifier.mbid, autocorrect: 1 };
  }

  return {
    artist: identifier.artist,
    track: identifier.track,
    autocorrect: 1,
  };
}

const lastfmTrackService = createLastfmTrackService({
  fetchTrackInfo: (params) => fetchFromLastfm("track.getInfo", params),
  fetchTrackTopTags: (params) => fetchFromLastfm("track.getTopTags", params),
});

export { createLastfmTrackService, lastfmTrackService };
