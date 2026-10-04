import { createLastfmArtistGateway } from "./gateway.js";
import { mapArtistLookupToGenreInput, mapLastfmArtistInfo } from "./mapper.js";
import { fetchFromLastfm } from "../lastfm.client.js";
import type {
  ArtistGenreLookup,
  ArtistGenreReader,
} from "@application/lastfm/artist-genre-distribution.js";
import type { LastfmTag } from "@application/lastfm/types.js";
import type { LastfmArtistApiResponse, LastfmArtistGateway } from "./types.js";

const INVALID_API_KEY_ERROR_CODE = 10;

/** Operacje odczytu artystów udostępniane przypadkom użycia. */
type LastfmArtistReader = ArtistGenreReader & {
  getArtistTags(artistName: string): Promise<LastfmTag[]>;
};

/** Tworzy adapter mapujący surowe odpowiedzi artystów na modele aplikacji. */
function createLastfmArtistReader(
  artistGateway: LastfmArtistGateway
): LastfmArtistReader {
  async function lookupMany(
    artistNames: string[]
  ): Promise<ArtistGenreLookup[]> {
    const lookups = await artistGateway.lookupMany(artistNames);

    return lookups.map((lookup) => {
      const artist = mapArtistLookupToGenreInput(lookup);

      if (lookup.status === "fulfilled") {
        return { status: "fulfilled", artist };
      }

      return {
        status: "rejected",
        artist,
        error: lookup.error,
        invalidCredentials: hasErrorCode(
          lookup.error,
          INVALID_API_KEY_ERROR_CODE
        ),
      };
    });
  }

  async function getArtistTags(artistName: string): Promise<LastfmTag[]> {
    const response = await artistGateway.lookupArtist(artistName);
    return mapLastfmArtistInfo(response, artistName).tags;
  }

  return { lookupMany, getArtistTags };
}

function hasErrorCode(error: unknown, expectedCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === expectedCode
  );
}

const defaultLastfmArtistGateway = createLastfmArtistGateway({
  requestArtistInfo: (artistName) =>
    fetchFromLastfm("artist.getInfo", {
      artist: artistName,
      autocorrect: 1,
    }) as Promise<LastfmArtistApiResponse>,
});

const lastfmArtistReader = createLastfmArtistReader(defaultLastfmArtistGateway);

export { createLastfmArtistReader, lastfmArtistReader };
export type { LastfmArtistReader };
