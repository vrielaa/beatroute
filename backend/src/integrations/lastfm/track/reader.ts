import { createLastfmTrackGateway } from "./gateway.js";
import { mapLastfmTrackMetadata, mapLastfmTrackTopTags } from "./mapper.js";
import { fetchFromLastfm } from "../lastfm.client.js";
import type { LastfmTrackReader } from "@application/lastfm/track-info.js";
import type { LastfmTrackIdentifier } from "@application/lastfm/types.js";
import type { LastfmTrackGateway, LastfmTrackRequestParams } from "./types.js";

/** Tworzy adapter zwracający znormalizowane dane i top tagi utworu. */
function createLastfmTrackReader(
  trackGateway: LastfmTrackGateway
): LastfmTrackReader {
  async function getTrackMetadata(identifier: LastfmTrackIdentifier) {
    const response = await trackGateway.lookupTrack(identifier);
    return mapLastfmTrackMetadata(response, identifier.artist ?? null);
  }

  async function getTrackTopTags(identifier: LastfmTrackIdentifier) {
    const response = await trackGateway.lookupTrackTopTags(identifier);
    return mapLastfmTrackTopTags(response);
  }

  return { getTrackMetadata, getTrackTopTags };
}

const defaultLastfmTrackGateway = createLastfmTrackGateway({
  requestTrackInfo: (params) => fetchFromLastfm("track.getInfo", params),
  requestTrackTopTags: (params: LastfmTrackRequestParams) =>
    fetchFromLastfm("track.getTopTags", params),
});

const lastfmTrackReader = createLastfmTrackReader(defaultLastfmTrackGateway);

export { createLastfmTrackReader, lastfmTrackReader };
