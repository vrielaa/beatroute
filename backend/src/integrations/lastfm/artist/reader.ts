import { createLastfmArtistGateway } from "./gateway.js";
import {
  mapArtistInfoResultToGenreInput,
  mapLastfmArtistInfo,
} from "./mapper.js";
import { fetchFromLastfm } from "../lastfm.client.js";
import type {
  ArtistGenreResult,
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
  async function getManyArtistGenreResults(
    artistNames: string[]
  ): Promise<ArtistGenreResult[]> {
    const artistInfoResults =
      await artistGateway.getManyArtistInfoResults(artistNames);

    return artistInfoResults.map((result) => {
      const artist = mapArtistInfoResultToGenreInput(result);

      if (result.status === "fulfilled") {
        return { status: "fulfilled", artist };
      }

      return {
        status: "rejected",
        artist,
        error: result.error,
        invalidCredentials: hasErrorCode(
          result.error,
          INVALID_API_KEY_ERROR_CODE
        ),
      };
    });
  }

  async function getArtistTags(artistName: string): Promise<LastfmTag[]> {
    const response = await artistGateway.getArtistInfo(artistName);
    return mapLastfmArtistInfo(response, artistName).tags;
  }

  return { getManyArtistGenreResults, getArtistTags };
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
  fetchArtistInfo: (artistName) =>
    fetchFromLastfm("artist.getInfo", {
      artist: artistName,
      autocorrect: 1,
    }) as Promise<LastfmArtistApiResponse>,
});

const lastfmArtistReader = createLastfmArtistReader(defaultLastfmArtistGateway);

export { createLastfmArtistReader, lastfmArtistReader };
export type { LastfmArtistReader };
