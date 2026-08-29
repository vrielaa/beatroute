import { ArtistGenreDistributionResponse, TopArtistsResponse } from '@src/app/core/models/models';

export interface ArtistsFoundRatio {
  requestedArtistsCount: number;
  spotifyTotalArtistsCount: number;
}

export function mapArtistsFoundRatio(
  topArtists: TopArtistsResponse | null
): ArtistsFoundRatio | null {
  if (!topArtists) return null;

  return {
    requestedArtistsCount: topArtists.limit,
    spotifyTotalArtistsCount: topArtists.total,
  };
}

export function mapArtistGenres(
  distribution: ArtistGenreDistributionResponse | null
): Record<string, string[]> {
  if (!distribution) return {};

  return distribution.genres.reduce<Record<string, string[]>>((genres, genre) => {
    const displayGenres = genre.subgenres.length ? genre.subgenres : [genre];

    for (const displayGenre of displayGenres) {
      for (const artist of displayGenre.artists) {
        const normalizedArtist = normalizeArtistName(artist);
        genres[normalizedArtist] = addUniqueGenre(
          genres[normalizedArtist] ?? [],
          displayGenre.name
        );
      }
    }

    return genres;
  }, {});
}

export function normalizeArtistName(artistName: string): string {
  return artistName.trim().toLocaleLowerCase();
}

function normalizeGenreName(genreName: string): string {
  return genreName.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function addUniqueGenre(genres: string[], genreName: string): string[] {
  const normalizedGenreName = normalizeGenreName(genreName);
  const alreadyExists = genres.some((genre) => normalizeGenreName(genre) === normalizedGenreName);

  return alreadyExists ? genres : [...genres, genreName];
}
