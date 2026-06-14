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

const NON_GENRE_TAGS = new Set([
  "american",
  "australian",
  "beautiful voice",
  "british",
  "canadian",
  "danish",
  "female vocalists",
  "finnish",
  "french",
  "german",
  "icelandic",
  "italian",
  "japanese",
  "korean",
  "male vocalists",
  "norwegian",
  "poland",
  "polish",
  "russian",
  "seen live",
  "soty",
  "spanish",
  "swedish",
  "ukrainian",
]);

function isLikelyGenreTag(tag) {
  const normalizedName = tag.name.toLowerCase();

  return (
    !NON_GENRE_TAGS.has(normalizedName) &&
    !/^(19|20)\d{2}$/.test(normalizedName) &&
    !/^(19|20)\d0s$/.test(normalizedName) &&
    !normalizedName.includes("'s daughter")
  );
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

  for (const artist of artistResults) {
    if (!artist.genre) {
      unmatchedArtists.push(artist.name);
      continue;
    }

    const normalizedGenre = artist.genre.toLocaleLowerCase();
    const existingGenre = genreMap.get(normalizedGenre) ?? {
      name: artist.genre,
      count: 0,
      artists: [],
    };

    existingGenre.count += 1;
    existingGenre.artists.push(artist.name);
    genreMap.set(normalizedGenre, existingGenre);
  }

  const matchedArtists = artistResults.length - unmatchedArtists.length;
  const genres = [...genreMap.values()]
    .sort(
      (firstGenre, secondGenre) =>
        secondGenre.count - firstGenre.count ||
        firstGenre.name.localeCompare(secondGenre.name)
    )
    .map((genre) => ({
      ...genre,
      percentage: matchedArtists
        ? Number(((genre.count / matchedArtists) * 100).toFixed(1))
        : 0,
    }));

  return {
    genres,
    totalArtists: artistResults.length,
    matchedArtists,
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
