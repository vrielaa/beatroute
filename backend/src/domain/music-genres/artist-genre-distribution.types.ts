export type GenreCandidate = {
  canonicalName: string | null;
  key: string;
  name: string;
};

export type Artist = ({ resolvedName: string } | { name: string }) & {
  requestedName?: string;
  genreCandidates?: GenreCandidate[];
};

export type SubgenreAccumulator = {
  name: string;
  count: number;
  artistNamesSet: Set<string>;
};

export type SubgenreMap = Map<string, SubgenreAccumulator>;

export type GenreAccumulator = {
  name: string;
  count: number;
  artistNamesSet: Set<string>;
  subgenreMap: SubgenreMap;
};

export type GenreMap = Map<string, GenreAccumulator>;

export type GenreAccumulation = {
  genreMap: GenreMap;
  unmatchedArtists: string[];
  totalGenreMatches: number;
};
