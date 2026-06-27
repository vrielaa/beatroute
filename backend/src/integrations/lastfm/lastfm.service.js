import { fetchFromLastfm } from "./lastfm.client.js";

export async function createLastfmSession(token) {
  const data = await fetchFromLastfm(
    "auth.getSession",
    { token },
    { signed: true }
  );

  if (!data?.session?.key || !data?.session?.name) {
    throw new Error("Last.fm nie zwrócił poprawnej sesji użytkownika");
  }

  return data.session;
}

export async function getLastfmUserInfo(username) {
  const data = await fetchFromLastfm("user.getInfo", { user: username });

  return data.user;
}

function normalizeLastfmTags(tags) {
  return (Array.isArray(tags) ? tags : tags ? [tags] : [])
    .map((tag) => ({
      name: typeof tag?.name === "string" ? tag.name.trim() : "",
      url: typeof tag?.url === "string" ? tag.url : null,
    }))
    .filter((tag) => tag.name);
}

function normalizeGenreName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " n ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPopToken(token) {
  return token === "pop" || token.endsWith("pop");
}

function isRapToken(token) {
  return token === "rap" || /^rap[a-z0-9]+$/.test(token);
}

function findTokenStartIndex(tokens, predicate) {
  let startIndex = 0;

  for (const token of tokens) {
    if (predicate(token)) {
      return startIndex;
    }

    startIndex += token.length;
  }

  return -1;
}

const CORE_GENRE_RULES = [
  {
    name: "dancehall",
    index: ({ compactName }) => compactName.indexOf("dancehall"),
  },
  {
    name: "drum and bass",
    index: ({ compactName }) => {
      const drumAndBassIndex = compactName.indexOf("drumandbass");
      return drumAndBassIndex >= 0
        ? drumAndBassIndex
        : compactName.indexOf("dnb");
    },
  },
  {
    name: "dubstep",
    index: ({ compactName }) => compactName.indexOf("dubstep"),
  },
  {
    name: "reggaeton",
    index: ({ compactName }) => compactName.indexOf("reggaeton"),
  },
  {
    name: "hip hop",
    index: ({ compactName }) => compactName.indexOf("hiphop"),
  },
  {
    name: "r&b",
    index: ({ compactName }) => compactName.indexOf("rnb"),
  },
  {
    name: "electronic",
    index: ({ compactName }) => {
      const electronicIndexes = ["electronic", "electronica", "electro"]
        .map((keyword) => compactName.indexOf(keyword))
        .filter((index) => index >= 0);

      return electronicIndexes.length ? Math.min(...electronicIndexes) : -1;
    },
  },
  {
    name: "pop",
    index: ({ tokens }) => findTokenStartIndex(tokens, isPopToken),
  },
  {
    name: "rap",
    index: ({ tokens }) => findTokenStartIndex(tokens, isRapToken),
  },
  {
    name: "rock",
    index: ({ compactName }) => compactName.indexOf("rock"),
  },
  {
    name: "alternative",
    index: ({ compactName }) => compactName.indexOf("alternative"),
  },
  {
    name: "ambient",
    index: ({ compactName }) => compactName.indexOf("ambient"),
  },
  {
    name: "afrobeat",
    index: ({ compactName }) => compactName.indexOf("afrobeat"),
  },
  {
    name: "blues",
    index: ({ compactName }) => compactName.indexOf("blues"),
  },
  {
    name: "classical",
    index: ({ compactName }) => compactName.indexOf("classical"),
  },
  {
    name: "country",
    index: ({ compactName }) => compactName.indexOf("country"),
  },
  {
    name: "dance",
    index: ({ compactName }) => compactName.indexOf("dance"),
  },
  {
    name: "disco",
    index: ({ compactName }) => compactName.indexOf("disco"),
  },
  {
    name: "dub",
    index: ({ compactName }) => compactName.indexOf("dub"),
  },
  {
    name: "emo",
    index: ({ compactName }) => compactName.indexOf("emo"),
  },
  {
    name: "experimental",
    index: ({ compactName }) => compactName.indexOf("experimental"),
  },
  {
    name: "folk",
    index: ({ compactName }) => compactName.indexOf("folk"),
  },
  {
    name: "funk",
    index: ({ compactName }) => compactName.indexOf("funk"),
  },
  {
    name: "garage",
    index: ({ compactName }) => compactName.indexOf("garage"),
  },
  {
    name: "goth",
    index: ({ compactName }) => compactName.indexOf("goth"),
  },
  {
    name: "grunge",
    index: ({ compactName }) => compactName.indexOf("grunge"),
  },
  {
    name: "hardcore",
    index: ({ compactName }) => compactName.indexOf("hardcore"),
  },
  {
    name: "house",
    index: ({ compactName }) => compactName.indexOf("house"),
  },
  {
    name: "indie",
    index: ({ compactName }) => compactName.indexOf("indie"),
  },
  {
    name: "industrial",
    index: ({ compactName }) => compactName.indexOf("industrial"),
  },
  {
    name: "jazz",
    index: ({ compactName }) => compactName.indexOf("jazz"),
  },
  {
    name: "latin",
    index: ({ compactName }) => compactName.indexOf("latin"),
  },
  {
    name: "metal",
    index: ({ compactName }) => compactName.indexOf("metal"),
  },
  {
    name: "punk",
    index: ({ compactName }) => compactName.indexOf("punk"),
  },
  {
    name: "reggae",
    index: ({ compactName }) => compactName.indexOf("reggae"),
  },
  {
    name: "ska",
    index: ({ compactName }) => compactName.indexOf("ska"),
  },
  {
    name: "shoegaze",
    index: ({ compactName }) => compactName.indexOf("shoegaze"),
  },
  {
    name: "soul",
    index: ({ compactName }) => compactName.indexOf("soul"),
  },
  {
    name: "techno",
    index: ({ compactName }) => compactName.indexOf("techno"),
  },
  {
    name: "trance",
    index: ({ compactName }) => compactName.indexOf("trance"),
  },
  {
    name: "trap",
    index: ({ compactName }) => compactName.indexOf("trap"),
  },
  {
    name: "wave",
    index: ({ compactName }) => compactName.indexOf("wave"),
  },
];

function getCanonicalGenreName(name) {
  const normalizedName = normalizeGenreName(name);

  if (
    !normalizedName ||
    /^(19|20)\d{2}$/.test(normalizedName) ||
    /^(19|20)\d0s$/.test(normalizedName) ||
    /^\d{2}'?s$/.test(normalizedName)
  ) {
    return null;
  }

  const tokens = normalizedName.split(" ");
  const compactName = tokens.join("");
  const matches = CORE_GENRE_RULES.map((rule, priority) => ({
    name: rule.name,
    priority,
    index: rule.index({ normalizedName, compactName, tokens }),
  }))
    .filter((match) => match.index >= 0)
    .sort(
      (firstMatch, secondMatch) =>
        firstMatch.index - secondMatch.index ||
        firstMatch.priority - secondMatch.priority
    );

  return matches[0]?.name ?? null;
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

function isLikelyGenreTag(tag) {
  return getCanonicalGenreName(tag.name) !== null;
}

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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
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
        return { name: artist, genre: null };
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

export async function getLastfmTrackInfo({ artist, track, mbid }) {
  const params = { autocorrect: 1 };

  if (mbid) {
    params.mbid = mbid;
  } else {
    params.artist = artist;
    params.track = track;
  }

  const data = await fetchFromLastfm("track.getInfo", params);
  const resolvedArtist = data?.track?.artist?.name ?? artist ?? null;
  let normalizedTags = normalizeLastfmTags(data?.track?.toptags?.tag);
  let genreSource = normalizedTags.length ? "lastfm-top-tags" : null;

  if (!normalizedTags.length) {
    const topTagsData = await fetchFromLastfm("track.getTopTags", params);
    normalizedTags = normalizeLastfmTags(topTagsData?.toptags?.tag);
    genreSource = normalizedTags.length ? "lastfm-track-top-tags" : null;
  }

  if (!normalizedTags.length && resolvedArtist) {
    const artistInfo = await getLastfmArtistInfo(resolvedArtist);
    normalizedTags = artistInfo.tags;
    genreSource = normalizedTags.length ? "lastfm-artist-info-tags" : null;
  }

  const genreTags = normalizedTags.filter(isLikelyGenreTag);

  return {
    name: data?.track?.name ?? null,
    artist: resolvedArtist,
    mbid: data?.track?.mbid || null,
    url: data?.track?.url ?? null,
    genre: genreTags[0]?.name ?? null,
    genreCandidates: genreTags.map((tag) => tag.name),
    tags: normalizedTags,
    genreSource,
    genreIsFallback: genreSource === "lastfm-artist-info-tags",
  };
}

function buildTrackParams({
  artist,
  track,
  album,
  albumArtist,
  duration,
  trackNumber,
  mbid,
}) {
  const params = { artist, track };
  const optionalParams = {
    album,
    albumArtist,
    duration,
    trackNumber,
    mbid,
  };

  for (const [key, value] of Object.entries(optionalParams)) {
    if (value !== undefined && value !== null && value !== "") {
      params[key] = value;
    }
  }

  return params;
}

export async function updateNowPlaying(trackData, sessionKey) {
  return fetchFromLastfm(
    "track.updateNowPlaying",
    buildTrackParams(trackData),
    {
      signed: true,
      sessionKey,
      httpMethod: "POST",
    }
  );
}

export async function scrobbleTrack(trackData, sessionKey) {
  const params = {
    ...buildTrackParams(trackData),
    timestamp: trackData.timestamp,
  };

  if (trackData.chosenByUser !== undefined) {
    params.chosenByUser = trackData.chosenByUser ? 1 : 0;
  }

  return fetchFromLastfm("track.scrobble", params, {
    signed: true,
    sessionKey,
    httpMethod: "POST",
  });
}
