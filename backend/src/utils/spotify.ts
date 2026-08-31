import { defaultSpotifyAuthClient } from "@integrations/spotify/spotify.auth.client.js";
import type { Request } from "express";
import type { SpotifyAuthClient } from "@integrations/spotify/spotify.auth.types.js";

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
      throw new Error("Brak sesji Spotify");
    }

    const refreshToken = spotifySession.refreshToken;

    if (!refreshToken) {
      throw new Error("Brak refresh tokena");
    }

    const data = await authClient.refreshAccessToken(refreshToken);

    spotifySession.accessToken = data.access_token;
    spotifySession.expiresAt = now() + data.expires_in * 1000;

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
