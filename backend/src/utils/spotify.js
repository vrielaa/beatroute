import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
} from "../config/spotify.config.js";

export function getSpotifyBasicAuthHeader() {
  const value = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  return `Basic ${value}`;
}

export async function refreshAccessToken(req) {
  const refreshToken = req.session.spotify?.refreshToken;

  if (!refreshToken) {
    throw new Error("Brak refresh tokena");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getSpotifyBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || "Nie udało się odświeżyć tokena");
  }

  req.session.spotify.accessToken = data.access_token;
  req.session.spotify.expiresAt = Date.now() + data.expires_in * 1000;

  if (data.refresh_token) {
    req.session.spotify.refreshToken = data.refresh_token;
  }
}
