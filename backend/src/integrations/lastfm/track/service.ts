import { fetchFromLastfm } from "../lastfm.client.js";
import { lastfmArtistService } from "../artist/service.js";
import { isLikelyGenreTag } from "../genre-classifier.js";
import { createLastfmTrackGateway } from "./gateway.js";
import { mapLastfmTrackMetadata, mapLastfmTrackTopTags } from "./mapper.js";
import type {
  LastfmGenreSource,
  LastfmTrackGateway,
  LastfmTrackIdentifier,
  LastfmTrackInfo,
  LastfmTrackRequestParams,
  LastfmTrackService,
} from "./types.js";
import type { LastfmTag } from "../types.js";

/** Zależności wymagane przez przypadek użycia danych utworu Last.fm. */
type LastfmTrackServiceDependencies = {
  /** Gateway dostarczający surowe dane utworu i jego top tagi. */
  trackGateway: LastfmTrackGateway;
  /** Pobiera znormalizowane tagi artysty używane jako ostatni fallback. */
  getArtistTags: (artistName: string) => Promise<LastfmTag[]>;
};

/**
 * Tworzy serwis pobierający metadane utworu i klasyfikujący jego gatunki.
 * Serwis sprawdza kolejno tagi z `track.getInfo`, `track.getTopTags` oraz tagi
 * artysty. Błędy gatewaya są przekazywane wywołującemu.
 *
 * @param dependencies - Gateway utworów i funkcja pobierająca tagi artysty.
 * @returns Operacje serwisu utworów Last.fm.
 */
function createLastfmTrackService({
  trackGateway,
  getArtistTags,
}: LastfmTrackServiceDependencies): LastfmTrackService {
  async function getTrackInfo(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackInfo> {
    const trackResponse = await trackGateway.lookupTrack(identifier);
    const trackMetadata = mapLastfmTrackMetadata(
      trackResponse,
      identifier.artist ?? null
    );

    let normalizedTags: LastfmTag[] = trackMetadata.tags;
    let genreTags: LastfmTag[] = normalizedTags.filter(isLikelyGenreTag);

    let genreSource: LastfmGenreSource = genreTags.length
      ? "lastfm-top-tags"
      : null;

    if (!genreTags.length) {
      const topTagsResponse = await trackGateway.lookupTrackTopTags(identifier);

      normalizedTags = mapLastfmTrackTopTags(topTagsResponse);
      genreTags = normalizedTags.filter(isLikelyGenreTag);

      genreSource = genreTags.length ? "lastfm-track-top-tags" : null;
    }

    if (!genreTags.length && trackMetadata.artist) {
      normalizedTags = await getArtistTags(trackMetadata.artist);
      genreTags = normalizedTags.filter(isLikelyGenreTag);

      genreSource = genreTags.length ? "lastfm-artist-info-tags" : null;
    }

    return {
      name: trackMetadata.name,
      artist: trackMetadata.artist,
      mbid: trackMetadata.mbid,
      url: trackMetadata.url,
      genre: genreTags[0]?.name ?? null,
      genreCandidates: genreTags.map((tag) => tag.name),
      tags: normalizedTags,
      genreSource,
      genreIsFallback: genreSource === "lastfm-artist-info-tags",
    };
  }

  return {
    getTrackInfo,
  };
}

const defaultLastfmTrackGateway = createLastfmTrackGateway({
  requestTrackInfo: (params) => fetchFromLastfm("track.getInfo", params),

  requestTrackTopTags: (params: LastfmTrackRequestParams) =>
    fetchFromLastfm("track.getTopTags", params),
});

/** Serwis utworów korzystający z produkcyjnych zależności Last.fm. */
const lastfmTrackService = createLastfmTrackService({
  trackGateway: defaultLastfmTrackGateway,
  getArtistTags: async (artistName: string) => {
    const artistInfo = await lastfmArtistService.getArtistInfo(artistName);

    return artistInfo.tags;
  },
});

export { createLastfmTrackService, lastfmTrackService };
