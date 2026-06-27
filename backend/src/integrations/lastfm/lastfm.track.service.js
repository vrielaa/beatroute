import { fetchFromLastfm } from "./lastfm.client.js";
import { getLastfmArtistInfo } from "./lastfm.artist.service.js";
import {
  isLikelyGenreTag,
  normalizeLastfmTags,
} from "./genre-classifier.js";

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
