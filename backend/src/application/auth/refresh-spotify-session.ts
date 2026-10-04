import { SpotifyReauthorizationRequiredError } from "./spotify-reauthorization-required.error.js";
import type { SpotifySession, SpotifyTokenRefresher } from "./types.js";

type RefreshSpotifyAccessTokenDependencies = {
  refreshToken: SpotifyTokenRefresher;
  now: () => number;
};

/** Tworzy operację odświeżania danych dostępowych zapisanych w sesji. */
function createRefreshSpotifySession({
  refreshToken: requestRefreshedToken,
  now,
}: RefreshSpotifyAccessTokenDependencies) {
  return async function refreshSpotifySession(
    spotifySession: SpotifySession | undefined
  ): Promise<SpotifySession> {
    if (!spotifySession) {
      throw new SpotifyReauthorizationRequiredError();
    }

    const refreshToken = spotifySession.refreshToken;

    if (!refreshToken) {
      throw new SpotifyReauthorizationRequiredError();
    }

    const token = await requestRefreshedToken(refreshToken);

    return {
      ...spotifySession,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? spotifySession.refreshToken,
      expiresAt: now() + token.expiresInSeconds * 1000,
      scope: token.scope,
      tokenType: token.tokenType,
    };
  };
}

export { createRefreshSpotifySession };
export type { RefreshSpotifyAccessTokenDependencies };
