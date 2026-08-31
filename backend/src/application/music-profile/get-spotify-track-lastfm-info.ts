import type {
  SpotifyTrackApiResponse,
  SpotifyGateway,
  SpotifyTrackSummary,
} from "@integrations/spotify/spotify.types.js";

import type {
  LastfmTrackIdentifier,
  LastfmTrackInfo,
  LastfmTrackService,
} from "@integrations/lastfm/track/types.js";

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
  spotify: SpotifyTrackSummary;
  /** Metadane i klasyfikacja gatunkowa przygotowane na podstawie Last.fm. */
  lastfm: LastfmTrackInfo;
};

/** Operacje potrzebne do zbudowania profilu utworu bez zależności od HTTP. */
type SpotifyTrackProfileDependencies = {
  /** Pobiera utwór z Spotify Web API. */
  getSpotifyTrackById: SpotifyGateway["getSpotifyTrackById"];
  /** Pobiera i klasyfikuje informacje o utworze z Last.fm. */
  getLastfmTrackInfo: LastfmTrackService["getTrackInfo"];
  /** Zamienia odpowiedź Spotify na identyfikator akceptowany przez Last.fm. */
  mapSpotifyTrackForLastfm: (
    spotifyTrack: SpotifyTrackApiResponse
  ) => LastfmTrackIdentifier;
  /** Ogranicza odpowiedź Spotify do pól zwracanych przez aplikację. */
  mapSpotifyTrackResponse: (
    spotifyTrack: SpotifyTrackApiResponse
  ) => SpotifyTrackSummary;
};

/**
 * Tworzy operację łączącą dane jednego utworu ze Spotify i Last.fm.
 * Jawne zależności pozwalają testować przebieg bez wykonywania zapytań HTTP.
 *
 * @param dependencies - Gatewaye oraz mappery wymagane przez operację.
 * @returns Funkcja pobierająca połączony profil utworu.
 */
function createGetSpotifyTrackLastfmInfo({
  getSpotifyTrackById,
  getLastfmTrackInfo,
  mapSpotifyTrackForLastfm,
  mapSpotifyTrackResponse,
}: SpotifyTrackProfileDependencies) {
  return async function getSpotifyTrackLastfmInfo({
    spotifyTrackId,
    accessToken,
  }: SpotifyTrackProfileRequest): Promise<SpotifyTrackProfile> {
    const spotifyTrack = await getSpotifyTrackById(spotifyTrackId, accessToken);
    const lastfmTrackQuery = mapSpotifyTrackForLastfm(spotifyTrack);
    const lastfmTrackInfo = await getLastfmTrackInfo(lastfmTrackQuery);

    return {
      spotify: mapSpotifyTrackResponse(spotifyTrack),
      lastfm: lastfmTrackInfo,
    };
  };
}

export { createGetSpotifyTrackLastfmInfo };
export type { SpotifyTrackProfileRequest, SpotifyTrackProfile };
