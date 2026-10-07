import {
  mapArtistInfoResultToGenreInput,
  mapLastfmArtistInfo,
} from "./mapper.js";
import { fetchFromLastfm } from "../lastfm.client.js";
import type { ArtistGenreResult } from "@application/lastfm/artist-genre-distribution.js";
import type { LastfmTag } from "@application/lastfm/types.js";
import type {
  LastfmArtistService,
  LastfmArtistServiceDependencies,
  LastfmArtistInfoResult,
} from "./types.js";

const INVALID_API_KEY_ERROR_CODE = 10;

/**
 * Tworzy adapter pobierający dane artystów i mapujący je na modele aplikacji.
 * Błędy pojedynczych artystów zachowuje jako wyniki, a ograniczanie wywołań
 * HTTP pozostawia schedulerowi klienta Last.fm.
 *
 * @param dependencies - Adapter metody `artist.getInfo` i opcjonalny logger.
 * @returns Operacje pobierania tagów i danych do klasyfikacji gatunków.
 */
function createLastfmArtistService({
  fetchArtistInfo,
  logger = console,
}: LastfmArtistServiceDependencies): LastfmArtistService {
  /** Zamienia powodzenie lub błąd pobrania artysty na jawny wynik. */
  async function getArtistInfoResult(
    artistName: string
  ): Promise<LastfmArtistInfoResult> {
    try {
      const response = await fetchArtistInfo(artistName);
      return { status: "fulfilled", requestedName: artistName, response };
    } catch (error) {
      logger.error(`Last.fm artist info error for "${artistName}":`, error);
      return { status: "rejected", requestedName: artistName, error };
    }
  }

  /** Pobiera wyniki klasyfikacji w kolejności nazw, zachowując częściowe błędy. */
  async function getManyArtistGenreResults(
    artistNames: string[]
  ): Promise<ArtistGenreResult[]> {
    const artistInfoResults = await Promise.all(
      artistNames.map(getArtistInfoResult)
    );

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

  /** Pobiera znormalizowane tagi jednego artysty; błędy przekazuje wywołującemu. */
  async function getArtistTags(artistName: string): Promise<LastfmTag[]> {
    const response = await fetchArtistInfo(artistName);
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

const lastfmArtistService = createLastfmArtistService({
  fetchArtistInfo: (artistName) =>
    fetchFromLastfm("artist.getInfo", {
      artist: artistName,
      autocorrect: 1,
    }),
});

export { createLastfmArtistService, lastfmArtistService };
