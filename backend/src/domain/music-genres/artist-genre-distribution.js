function buildSubgenres(subgenreMap) {
  const totalMatches = [...subgenreMap.values()].reduce(
    (sum, subgenre) => sum + subgenre.count,
    0
  );

  return [...subgenreMap.values()]
    .sort(
      (first, second) =>
        second.count - first.count || first.name.localeCompare(second.name)
    )
    .map(({ artistSet, ...subgenre }) => ({
      ...subgenre,
      artists: [...artistSet],
      percentage: totalMatches
        ? Number(((subgenre.count / totalMatches) * 100).toFixed(1))
        : 0,
    }));
}

export function buildArtistGenreDistribution(artists, { source = null } = {}) {
  const genreMap = new Map();
  const unmatchedArtists = [];
  let totalGenreMatches = 0;

  for (const artist of artists) {
    const artistName = artist.requestedName ?? artist.name;
    const candidates = (artist.genreCandidates ?? []).filter(
      (candidate) => candidate.canonicalName
    );

    if (!candidates.length) {
      unmatchedArtists.push(artistName);
      continue;
    }

    for (const candidate of candidates) {
      const existingGenre = genreMap.get(candidate.canonicalName) ?? {
        name: candidate.canonicalName,
        count: 0,
        artistSet: new Set(),
        subgenreMap: new Map(),
      };
      const existingSubgenre = existingGenre.subgenreMap.get(candidate.key) ?? {
        name: candidate.name,
        count: 0,
        artistSet: new Set(),
      };

      existingSubgenre.count += 1;
      existingSubgenre.artistSet.add(artistName);
      existingGenre.subgenreMap.set(candidate.key, existingSubgenre);

      existingGenre.count += 1;
      existingGenre.artistSet.add(artistName);
      totalGenreMatches += 1;
      genreMap.set(candidate.canonicalName, existingGenre);
    }
  }

  const genres = [...genreMap.values()]
    .sort(
      (first, second) =>
        second.count - first.count || first.name.localeCompare(second.name)
    )
    .map(({ subgenreMap, artistSet, ...genre }) => ({
      ...genre,
      artists: [...artistSet],
      percentage: totalGenreMatches
        ? Number(((genre.count / totalGenreMatches) * 100).toFixed(1))
        : 0,
      subgenres: buildSubgenres(subgenreMap),
    }));

  return {
    genres,
    totalArtists: artists.length,
    matchedArtists: artists.length - unmatchedArtists.length,
    totalGenreMatches,
    unmatchedArtists,
    source,
  };
}
