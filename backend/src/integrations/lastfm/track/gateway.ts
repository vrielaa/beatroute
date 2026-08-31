import type {
  LastfmTrackApiResponse,
  LastfmTrackGateway,
  LastfmTrackGatewayDependencies,
  LastfmTrackIdentifier,
  LastfmTrackRequestParams,
  LastfmTrackTopTagsApiResponse,
} from "./types.js";

/**
 * Tworzy gateway odpowiedzialny za pobieranie danych utworów z Last.fm.
 * Gateway zamienia identyfikator utworu na parametry Last.fm i przekazuje
 * wykonanie zapytania odpowiedniemu adapterowi.
 *
 * @param dependencies - Adaptery metod `track.getInfo` i `track.getTopTags`.
 * @returns Gateway obsługujący dane i top tagi jednego utworu.
 */
function createLastfmTrackGateway({
  requestTrackInfo,
  requestTrackTopTags,
}: LastfmTrackGatewayDependencies): LastfmTrackGateway {
  async function lookupTrack(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackApiResponse> {
    return requestTrackInfo(createRequestParams(identifier));
  }

  async function lookupTrackTopTags(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackTopTagsApiResponse> {
    return requestTrackTopTags(createRequestParams(identifier));
  }

  return {
    lookupTrack,
    lookupTrackTopTags,
  };
}

/**
 * Buduje dozwolone parametry Last.fm dla jednego sposobu identyfikacji utworu.
 *
 * @param identifier - MBID albo para nazw artysty i utworu.
 * @returns Parametry zapytania z włączoną korektą nazw.
 */
function createRequestParams(
  identifier: LastfmTrackIdentifier
): LastfmTrackRequestParams {
  if (identifier.mbid !== undefined) {
    return {
      mbid: identifier.mbid,
      autocorrect: 1,
    };
  }

  return {
    artist: identifier.artist,
    track: identifier.track,
    autocorrect: 1,
  };
}

export { createLastfmTrackGateway };
