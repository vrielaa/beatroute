import { buildArtistGenreDistribution } from "@domain/music-genres/artist-genre-distribution.js";
import type { Artist } from "@domain/music-genres/artist-genre-distribution.types.js";

const GENRE_SOURCE = "lastfm-artist-info-tags";

/** Wynik pobrania artysty przygotowany do klasyfikacji domenowej. */
type ArtistGenreLookup =
  | { status: "fulfilled"; artist: Artist }
  | {
      status: "rejected";
      artist: Artist;
      error: unknown;
      invalidCredentials: boolean;
    };

/** Port udostępniający dane wielu artystów. */
type ArtistGenreReader = {
  lookupMany(artistNames: string[]): Promise<ArtistGenreLookup[]>;
};

/** Tworzy przypadek użycia budowania rozkładu gatunków artystów. */
function createArtistGenreDistribution({
  artistReader,
}: {
  artistReader: ArtistGenreReader;
}) {
  return async function getArtistGenreDistribution(artistNames: string[]) {
    const uniqueArtistNames = deduplicateArtistNames(artistNames);
    const lookups = await artistReader.lookupMany(uniqueArtistNames);

    assertNoCriticalLookupFailure(lookups);

    return {
      ...buildArtistGenreDistribution(lookups.map((lookup) => lookup.artist)),
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
function assertNoCriticalLookupFailure(lookups: ArtistGenreLookup[]): void {
  const failures = lookups.filter(isRejectedLookup);
  const invalidCredentialsFailure = failures.find(
    (lookup) => lookup.invalidCredentials
  );

  if (invalidCredentialsFailure) {
    throw invalidCredentialsFailure.error;
  }

  if (lookups.length > 0 && failures.length === lookups.length) {
    throw failures[0].error;
  }
}

function isRejectedLookup(
  lookup: ArtistGenreLookup
): lookup is Extract<ArtistGenreLookup, { status: "rejected" }> {
  return lookup.status === "rejected";
}

export { createArtistGenreDistribution };
export type { ArtistGenreLookup, ArtistGenreReader };
