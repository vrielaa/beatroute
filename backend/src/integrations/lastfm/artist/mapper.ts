import type { Artist } from "@domain/music-genres/artist-genre-distribution.types.js";
import {
  getCanonicalGenreName,
  isLikelyGenreTag,
  normalizeGenreName,
  normalizeLastfmTags,
} from "../genre-classifier.js";
import type {
  LastfmArtistApiResponse,
  LastfmArtistInfo,
  LastfmArtistLookup,
} from "./types.js";

/**
 * Mapuje surową odpowiedź Last.fm na informacje o artyście używane w aplikacji.
 * Normalizuje tagi i pozostawia jako kandydatów tylko tagi przypominające
 * gatunki muzyczne.
 *
 * @param response - Surowy fragment odpowiedzi `artist.getInfo`.
 * @param requestedName - Nazwa użyta w zapytaniu do Last.fm.
 * @returns Ujednolicony model artysty z listą kandydatów na gatunki.
 */
function mapLastfmArtistInfo(
  response: LastfmArtistApiResponse,
  requestedName: string
): LastfmArtistInfo {
  const tags = normalizeLastfmTags(response.artist?.tags?.tag);
  const genreTags = tags.filter(isLikelyGenreTag);

  return {
    name: response.artist?.name ?? requestedName,
    requestedName,
    mbid: response.artist?.mbid || null,
    url: response.artist?.url ?? null,
    genre: genreTags[0]?.name ?? null,
    genreCandidates: genreTags.map((tag) => tag.name),
    tags,
  };
}

/**
 * Mapuje wynik wyszukiwania Last.fm na wejście klasyfikacji domenowej.
 * Nieudane wyszukiwanie reprezentuje artystę bez kandydatów na gatunek,
 * dzięki czemu domena może uwzględnić go na liście niedopasowanych artystów.
 *
 * @param lookup - Udany lub nieudany wynik pobrania danych artysty.
 * @returns Artysta przygotowany do budowania rozkładu gatunków.
 */
function mapArtistLookupToGenreInput(lookup: LastfmArtistLookup): Artist {
  if (lookup.status === "rejected") {
    return {
      resolvedName: lookup.requestedName,
      requestedName: lookup.requestedName,
      genreCandidates: [],
    };
  }

  const artistInfo = mapLastfmArtistInfo(lookup.response, lookup.requestedName);

  return {
    resolvedName: artistInfo.name,
    requestedName: artistInfo.requestedName,
    genreCandidates: artistInfo.genreCandidates.map((name) => ({
      name,
      key: normalizeGenreName(name),
      canonicalName: getCanonicalGenreName(name),
    })),
  };
}

export { mapLastfmArtistInfo, mapArtistLookupToGenreInput };
