import { refreshSpotifyAccessToken } from "../integrations/spotify/spotify.auth.client.js";

export async function refreshAccessToken(req) {
  const refreshToken = req.session.spotify?.refreshToken;

  if (!refreshToken) {
    throw new Error("Brak refresh tokena");
  }

  const data = await refreshSpotifyAccessToken(refreshToken);

  req.session.spotify.accessToken = data.access_token;
  req.session.spotify.expiresAt = Date.now() + data.expires_in * 1000;

  if (data.refresh_token) {
    req.session.spotify.refreshToken = data.refresh_token;
  }
}
