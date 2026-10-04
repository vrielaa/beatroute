import { SpotifyReauthorizationRequiredError } from "@application/auth/spotify-reauthorization-required.error.js";
import { SpotifyAuthApiError } from "./api-error.js";
import { defaultSpotifyAuthClient } from "./client.js";
import type { SpotifyTokenRefresher } from "@application/auth/types.js";
import type { SpotifyAuthClient } from "./types.js";

/**
 * Tworzy adapter odnawiający token i mapujący kontrakt Spotify na model aplikacji.
 */
function createSpotifyTokenRefresher(
  authClient: Pick<SpotifyAuthClient, "refreshAccessToken">
): SpotifyTokenRefresher {
  return async function refreshSpotifyToken(refreshToken) {
    try {
      const token = await authClient.refreshAccessToken(refreshToken);

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresInSeconds: token.expires_in,
        scope: token.scope,
        tokenType: token.token_type,
      };
    } catch (error) {
      if (
        error instanceof SpotifyAuthApiError &&
        error.oauthCode === "invalid_grant"
      ) {
        throw new SpotifyReauthorizationRequiredError();
      }

      throw error;
    }
  };
}

const spotifyTokenRefresher = createSpotifyTokenRefresher(
  defaultSpotifyAuthClient
);

export { createSpotifyTokenRefresher, spotifyTokenRefresher };
