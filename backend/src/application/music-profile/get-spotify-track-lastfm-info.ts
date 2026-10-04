import type {
  MusicProfileMetadataReader,
  MusicProfileSpotifyReader,
  MusicProfileSpotifyTrack,
  MusicProfileTrackInfo,
} from "./music-profile.ports.js";

/** Dane wymagane do pobrania profilu pojedynczego utworu. */
type SpotifyTrackProfileRequest = {
  /** Identyfikator utworu w Spotify. */
  spotifyTrackId: string;
  /** Token użytkownika umożliwiający odczyt danych ze Spotify. */
  accessToken: string;
};

/** Połączone dane utworu pochodzące ze Spotify i Last.fm. */
type SpotifyTrackProfile = {
  /** Skrócone dane utworu Spotify przeznaczone dla klienta aplikacji. */
  spotify: MusicProfileSpotifyTrack;
  /** Metadane i klasyfikacja gatunkowa przygotowane na podstawie Last.fm. */
  lastfm: MusicProfileTrackInfo;
};

/** Operacje potrzebne do zbudowania profilu utworu bez zależności od HTTP. */
type SpotifyTrackProfileDependencies = {
  /** Udostępnia dane utworu Spotify w modelu aplikacji. */
  spotifyTracks: MusicProfileSpotifyReader;
  /** Udostępnia metadane i gatunki utworu. */
  trackMetadata: MusicProfileMetadataReader;
};

/**
 * Tworzy operację łączącą dane jednego utworu ze Spotify i Last.fm.
 * Jawne zależności pozwalają testować przebieg bez wykonywania zapytań HTTP.
 *
 * @param dependencies - Gatewaye oraz mappery wymagane przez operację.
 * @returns Funkcja pobierająca połączony profil utworu.
 */
function createGetSpotifyTrackLastfmInfo({
  spotifyTracks,
  trackMetadata,
}: SpotifyTrackProfileDependencies) {
  return async function getSpotifyTrackLastfmInfo({
    spotifyTrackId,
    accessToken,
  }: SpotifyTrackProfileRequest): Promise<SpotifyTrackProfile> {
    const spotifyLookup = await spotifyTracks.getTrack(
      spotifyTrackId,
      accessToken
    );
    const lastfmTrackInfo = await trackMetadata.getTrackInfo(
      spotifyLookup.metadataIdentifier
    );

    return {
      spotify: spotifyLookup.track,
      lastfm: lastfmTrackInfo,
    };
  };
}

export { createGetSpotifyTrackLastfmInfo };
export type { SpotifyTrackProfileRequest, SpotifyTrackProfile };
