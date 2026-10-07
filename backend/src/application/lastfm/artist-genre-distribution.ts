import { buildArtistGenreDistribution } from "@domain/music-genres/artist-genre-distribution.js";
import type { Artist } from "@domain/music-genres/artist-genre-distribution.types.js";

const GENRE_SOURCE = "lastfm-artist-info-tags";

/**
 * Wynik przygotowania artysty do klasyfikacji gatunków.
 *
 * @property status - Informuje, czy dane artysty pobrano poprawnie.
 * @property artist - Artysta przygotowany dla logiki domenowej.
 * @property error - Oryginalny błąd dostępny dla wyniku `rejected`.
 * @property invalidCredentials - Informuje, czy przyczyną błędu są dane dostępowe Last.fm.
 */
type ArtistGenreResult =
  | { status: "fulfilled"; artist: Artist }
  | {
      status: "rejected";
      artist: Artist;
      error: unknown;
      invalidCredentials: boolean;
    };

/**
 * Port udostępniający artystów przygotowanych do klasyfikacji gatunków.
 *
 * @property getManyArtistGenreResults - Pobiera wyniki przygotowania wskazanych artystów.
 */
type ArtistGenreReader = {
  getManyArtistGenreResults(
    artistNames: string[]
  ): Promise<ArtistGenreResult[]>;
};

/** Tworzy przypadek użycia budowania rozkładu gatunków artystów. */
function createArtistGenreDistribution({
  artistReader,
}: {
  artistReader: ArtistGenreReader;
}) {
  return async function getArtistGenreDistribution(artistNames: string[]) {
    const uniqueArtistNames = deduplicateArtistNames(artistNames);
    const results =
      await artistReader.getManyArtistGenreResults(uniqueArtistNames);

    assertNoCriticalArtistGenreFailure(results);

    return {
      ...buildArtistGenreDistribution(results.map((result) => result.artist)),
      source: GENRE_SOURCE,
    };
  };
}

/** Usuwa powtórzone nazwy bez rozróżniania wielkości liter. */
function deduplicateArtistNames(artistNames: string[]): string[] {
  const uniqueArtistNames: string[] = [];
  const normalizedNames = new Set<string>();

  for (const artistName of artistNames) {
    const normalizedName = artistName.toLocaleLowerCase();

    if (!normalizedNames.has(normalizedName)) {
      normalizedNames.add(normalizedName);
      uniqueArtistNames.push(artistName);
    }
  }

  return uniqueArtistNames;
}

/** Przerywa operację dla błędnych danych dostępowych lub awarii wszystkich zapytań. */
function assertNoCriticalArtistGenreFailure(
  results: ArtistGenreResult[]
): void {
  const failures = results.filter(isRejectedArtistGenreResult);
  const invalidCredentialsFailure = failures.find(
    (result) => result.invalidCredentials
  );

  if (invalidCredentialsFailure) {
    throw invalidCredentialsFailure.error;
  }

  if (results.length > 0 && failures.length === results.length) {
    throw failures[0].error;
  }
}

function isRejectedArtistGenreResult(
  result: ArtistGenreResult
): result is Extract<ArtistGenreResult, { status: "rejected" }> {
  return result.status === "rejected";
}

export { createArtistGenreDistribution };
export type { ArtistGenreResult, ArtistGenreReader };
