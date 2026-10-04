import { SpotifyAuthApiError } from "@integrations/spotify/auth/api-error.js";
import { defaultSpotifyAuthClient } from "@integrations/spotify/auth/client.js";
import { SpotifyReauthorizationRequiredError } from "@integrations/spotify/auth/reauthorization-required.error.js";
import type { Request } from "express";
import type {
  SpotifyAuthClient,
  SpotifyTokenResponse,
} from "@integrations/spotify/auth/types.js";

type RefreshSpotifyAccessTokenDependencies = {
  authClient: Pick<SpotifyAuthClient, "refreshAccessToken">;
  now: () => number;
};

/** Tworzy operację odświeżania danych dostępowych zapisanych w sesji. */
function createRefreshAccessToken({
  authClient,
  now,
}: RefreshSpotifyAccessTokenDependencies) {
  return async function refreshAccessToken(req: Request): Promise<void> {
    const spotifySession = req.session.spotify;

    if (!spotifySession) {
      throw new SpotifyReauthorizationRequiredError();
    }

    const refreshToken = spotifySession.refreshToken;

    if (!refreshToken) {
      throw new SpotifyReauthorizationRequiredError();
    }

    let data: SpotifyTokenResponse;

    try {
      data = await authClient.refreshAccessToken(refreshToken);
    } catch (error) {
      if (
        error instanceof SpotifyAuthApiError &&
        error.oauthCode === "invalid_grant"
      ) {
        throw new SpotifyReauthorizationRequiredError();
      }

      throw error;
    }

    spotifySession.accessToken = data.access_token;
    spotifySession.expiresAt = now() + data.expires_in * 1000;
    spotifySession.scope = data.scope;
    spotifySession.tokenType = data.token_type;

    if (data.refresh_token) {
      spotifySession.refreshToken = data.refresh_token;
    }
  };
}

const refreshAccessToken = createRefreshAccessToken({
  authClient: defaultSpotifyAuthClient,
  now: Date.now,
});

export { createRefreshAccessToken, refreshAccessToken };
export type { RefreshSpotifyAccessTokenDependencies };
