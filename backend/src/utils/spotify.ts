import { defaultSpotifyAuthClient } from "@integrations/spotify/spotify.auth.client.js";
import { Request } from "express";

async function refreshAccessToken(req: Request): Promise<void> {
  const spotifySession = req.session.spotify;

  if (!spotifySession) {
    throw new Error("Brak sesji Spotify");
  }

  const refreshToken = spotifySession.refreshToken;

  if (!refreshToken) {
    throw new Error("Brak refresh tokena");
  }

  const data = await defaultSpotifyAuthClient.refreshAccessToken(refreshToken);

  spotifySession.accessToken = data.access_token;
  spotifySession.expiresAt = Date.now() + data.expires_in * 1000;

  if (data.refresh_token) {
    spotifySession.refreshToken = data.refresh_token;
  }
}

export { refreshAccessToken };
