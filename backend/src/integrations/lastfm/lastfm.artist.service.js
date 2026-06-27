import { fetchFromLastfm } from "./lastfm.client.js";
import {
  getCanonicalGenreName,
  isLikelyGenreTag,
  normalizeGenreName,
  normalizeLastfmTags,
} from "./genre-classifier.js";
import { mapWithConcurrency } from "../../utils/async.js";

export async function getLastfmArtistInfo(artist) {
  const data = await fetchFromLastfm("artist.getInfo", {
    artist,
    autocorrect: 1,
  });
  const resolvedArtist = data?.artist?.name ?? artist;
  const tags = normalizeLastfmTags(data?.artist?.tags?.tag);
  const genreTags = tags.filter(isLikelyGenreTag);

  return {
    name: resolvedArtist,
    requestedName: artist,
    mbid: data?.artist?.mbid || null,
    url: data?.artist?.url ?? null,
    genre: genreTags[0]?.name ?? null,
    genreCandidates: genreTags.map((tag) => tag.name),
    tags,
  };
}


function buildSubgenres(subgenreMap) {
  const totalSubgenreMatches = [...subgenreMap.values()].reduce(
    (sum, subgenre) => sum + subgenre.count,
    0
  );

  return [...subgenreMap.values()]
    .sort(
      (firstSubgenre, secondSubgenre) =>
        secondSubgenre.count - firstSubgenre.count ||
        firstSubgenre.name.localeCompare(secondSubgenre.name)
    )
    .map(({ artistSet, ...subgenre }) => ({
      ...subgenre,
      artists: [...artistSet],
      percentage: totalSubgenreMatches
        ? Number(((subgenre.count / totalSubgenreMatches) * 100).toFixed(1))
        : 0,
    }));
}

export async function getLastfmArtistGenreDistribution(artists) {
  const uniqueArtists = [];
  const seenArtists = new Set();

  for (const artist of artists) {
    const normalizedArtist = artist.toLocaleLowerCase();

    if (!seenArtists.has(normalizedArtist)) {
      seenArtists.add(normalizedArtist);
      uniqueArtists.push(artist);
    }
  }

  const artistResults = await mapWithConcurrency(
    uniqueArtists,
    5,
    async (artist) => {
      try {
        return await getLastfmArtistInfo(artist);
      } catch (error) {
        console.error(`Last.fm artist info error for "${artist}":`, error);
        return { name: artist, requestedName: artist, genre: null };
      }
    }
  );
  const genreMap = new Map();
  const unmatchedArtists = [];
  let totalGenreMatches = 0;

  for (const artist of artistResults) {
    const artistName = artist.requestedName ?? artist.name;

    if (!artist.genreCandidates?.length) {
      unmatchedArtists.push(artistName);
      continue;
    }

    let hasMatchedGenre = false;

    for (const genreName of artist.genreCandidates) {
      const canonicalGenreName = getCanonicalGenreName(genreName);

      if (!canonicalGenreName) {
        continue;
      }

      hasMatchedGenre = true;

      const existingGenre = genreMap.get(canonicalGenreName) ?? {
        name: canonicalGenreName,
        count: 0,
        artistSet: new Set(),
        subgenreMap: new Map(),
      };
      const normalizedSubgenre = normalizeGenreName(genreName);

      const existingSubgenre = existingGenre.subgenreMap.get(
        normalizedSubgenre
      ) ?? {
        name: genreName,
        count: 0,
        artistSet: new Set(),
      };

      existingSubgenre.count += 1;
      existingSubgenre.artistSet.add(artistName);
      existingGenre.subgenreMap.set(normalizedSubgenre, existingSubgenre);

      existingGenre.count += 1;
      existingGenre.artistSet.add(artistName);
      totalGenreMatches += 1;

      genreMap.set(canonicalGenreName, existingGenre);
    }

    if (!hasMatchedGenre) {
      unmatchedArtists.push(artistName);
    }
  }

  const matchedArtists = artistResults.length - unmatchedArtists.length;
  const genres = [...genreMap.values()]
    .sort(
      (firstGenre, secondGenre) =>
        secondGenre.count - firstGenre.count ||
        firstGenre.name.localeCompare(secondGenre.name)
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
    totalArtists: artistResults.length,
    matchedArtists,
    totalGenreMatches,
    unmatchedArtists,
    source: "lastfm-artist-info-tags",
  };
}
