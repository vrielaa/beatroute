import { createArtistGenreDistribution } from "@application/lastfm/artist-genre-distribution.js";
import { createLastfmTrackInfo } from "@application/lastfm/track-info.js";
import { lastfmArtistService } from "@integrations/lastfm/artist/service.js";
import { getLastfmUserInfo } from "@integrations/lastfm/lastfm.user.js";
import { isLikelyGenreTag } from "@integrations/lastfm/genre-classifier.js";
import { lastfmTrackService } from "@integrations/lastfm/track/service.js";
import { defaultSpotifyGateway } from "@integrations/spotify/spotify.gateway.js";
import {
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
} from "@integrations/spotify/spotify.mapper.js";
import { createGetSpotifyTrackLastfmInfo } from "@application/music-profile/get-spotify-track-lastfm-info.js";

const lastfmTrackInfoService = createLastfmTrackInfo({
  trackReader: lastfmTrackService,
  getArtistTags: lastfmArtistService.getArtistTags,
  isGenreTag: isLikelyGenreTag,
});

const defaultGetArtistGenreDistribution = createArtistGenreDistribution({
  artistReader: lastfmArtistService,
});

const defaultGetSpotifyTrackLastfmInfo = createGetSpotifyTrackLastfmInfo({
  spotifyTracks: {
    async getTrack(spotifyTrackId, accessToken) {
      const spotifyTrack = await defaultSpotifyGateway.getSpotifyTrackById(
        spotifyTrackId,
        accessToken
      );

      return {
        track: mapSpotifyTrackResponse(spotifyTrack),
        metadataIdentifier: mapSpotifyTrackForLastfm(spotifyTrack),
      };
    },
  },
  trackMetadata: lastfmTrackInfoService,
});

/** Operacje endpointów Last.fm skonfigurowane z produkcyjnymi adapterami. */
const lastfmOperations = {
  getUserInfo: getLastfmUserInfo,
  getTrackInfo: lastfmTrackInfoService.getTrackInfo,
  getGenreDistribution: defaultGetArtistGenreDistribution,
  getSpotifyTrackInfo: defaultGetSpotifyTrackLastfmInfo,
};

export { lastfmOperations };
