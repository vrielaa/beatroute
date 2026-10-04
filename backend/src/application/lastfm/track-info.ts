import type {
  LastfmTag,
  LastfmTrackIdentifier,
  LastfmTrackInfo,
  LastfmTrackMetadata,
} from "./types.js";

/** Port udostępniający znormalizowane dane utworu z Last.fm. */
type LastfmTrackReader = {
  getTrackMetadata(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackMetadata>;
  getTrackTopTags(identifier: LastfmTrackIdentifier): Promise<LastfmTag[]>;
};

/** Zależności wymagane przez przypadek użycia informacji o utworze. */
type LastfmTrackInfoDependencies = {
  trackReader: LastfmTrackReader;
  getArtistTags: (artistName: string) => Promise<LastfmTag[]>;
  isGenreTag: (tag: LastfmTag) => boolean;
};

/** Publiczny kontrakt pobierania i klasyfikowania danych utworu Last.fm. */
type LastfmTrackInfoService = {
  getTrackInfo(identifier: LastfmTrackIdentifier): Promise<LastfmTrackInfo>;
};

/**
 * Tworzy przypadek użycia pobierający metadane utworu i wybierający pierwsze
 * źródło, które zawiera tagi rozpoznawane jako gatunki muzyczne.
 */
function createLastfmTrackInfo({
  trackReader,
  getArtistTags,
  isGenreTag,
}: LastfmTrackInfoDependencies): LastfmTrackInfoService {
  async function getTrackInfo(
    identifier: LastfmTrackIdentifier
  ): Promise<LastfmTrackInfo> {
    const metadata = await trackReader.getTrackMetadata(identifier);
    let tags = metadata.tags;
    let genreTags = tags.filter(isGenreTag);
    let genreSource: LastfmTrackInfo["genreSource"] = genreTags.length
      ? "lastfm-top-tags"
      : null;

    if (!genreTags.length) {
      tags = await trackReader.getTrackTopTags(identifier);
      genreTags = tags.filter(isGenreTag);
      genreSource = genreTags.length ? "lastfm-track-top-tags" : null;
    }

    if (!genreTags.length && metadata.artist) {
      tags = await getArtistTags(metadata.artist);
      genreTags = tags.filter(isGenreTag);
      genreSource = genreTags.length ? "lastfm-artist-info-tags" : null;
    }

    return {
      ...metadata,
      genre: genreTags[0]?.name ?? null,
      genreCandidates: genreTags.map((tag) => tag.name),
      tags,
      genreSource,
      genreIsFallback: genreSource === "lastfm-artist-info-tags",
    };
  }

  return { getTrackInfo };
}

export { createLastfmTrackInfo };
export type {
  LastfmTrackReader,
  LastfmTrackInfoDependencies,
  LastfmTrackInfoService,
};
