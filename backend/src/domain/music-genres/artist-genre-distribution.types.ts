type GenreCandidate = {
  canonicalName: string | null;
  key: string;
  name: string;
};

type Artist = ({ resolvedName: string } | { name: string }) & {
  requestedName?: string;
  genreCandidates?: GenreCandidate[];
};

type SubgenreAccumulator = {
  name: string;
  count: number;
  artistNamesSet: Set<string>;
};

type SubgenreMap = Map<string, SubgenreAccumulator>;

type GenreAccumulator = {
  name: string;
  count: number;
  artistNamesSet: Set<string>;
  subgenreMap: SubgenreMap;
};

type GenreMap = Map<string, GenreAccumulator>;

type GenreAccumulation = {
  genreMap: GenreMap;
  unmatchedArtists: string[];
  totalGenreMatches: number;
};

export type {
  GenreCandidate,
  Artist,
  SubgenreAccumulator,
  SubgenreMap,
  GenreAccumulator,
  GenreMap,
  GenreAccumulation,
};
