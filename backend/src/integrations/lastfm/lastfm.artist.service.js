import { fetchFromLastfm } from "./lastfm.client.js";
import {
  getCanonicalGenreName,
  isLikelyGenreTag,
  normalizeGenreName,
  normalizeLastfmTags,
} from "./genre-classifier.js";
import { mapWithConcurrency } from "../../utils/async.js";
import { buildArtistGenreDistribution } from "../../domain/music-genres/artist-genre-distribution.js";

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
        return {
          name: artist,
          requestedName: artist,
          genre: null,
          error,
        };
      }
    }
  );

  const invalidApiKeyResult = artistResults.find(
    (artist) => artist.error?.code === 10
  );

  if (invalidApiKeyResult) {
    throw invalidApiKeyResult.error;
  }

  if (artistResults.length && artistResults.every((artist) => artist.error)) {
    throw artistResults[0].error;
  }

  const domainArtists = artistResults.map((artist) => ({
    ...artist,
    resolvedName: artist.name,
    genreCandidates: (artist.genreCandidates ?? []).map((name) => ({
      name,
      key: normalizeGenreName(name),
      canonicalName: getCanonicalGenreName(name),
    })),
  }));

  const distribution = buildArtistGenreDistribution(domainArtists);

  return {
    ...distribution,
    source: "lastfm-artist-info-tags",
  };
}
