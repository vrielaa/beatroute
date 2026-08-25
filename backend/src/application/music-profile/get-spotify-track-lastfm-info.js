export function createGetSpotifyTrackLastfmInfo({
  getSpotifyTrackById,
  getLastfmTrackInfo,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
}) {
  return async function getSpotifyTrackLastfmInfo({
    spotifyTrackId,
    accessToken,
  }) {
    const spotifyTrack = await getSpotifyTrackById(spotifyTrackId, accessToken);
    const lastfmTrackQuery = mapSpotifyTrackForLastfm(spotifyTrack);
    const lastfmTrackInfo = await getLastfmTrackInfo(lastfmTrackQuery);

    return {
      spotify: mapSpotifyTrackResponse(spotifyTrack),
      lastfm: lastfmTrackInfo,
    };
  };
}
