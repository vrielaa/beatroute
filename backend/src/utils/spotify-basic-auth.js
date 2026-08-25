import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
} from "../config/spotify.config.js";

export function getSpotifyBasicAuthHeader({
  clientId = SPOTIFY_CLIENT_ID,
  clientSecret = SPOTIFY_CLIENT_SECRET,
} = {}) {
  const value = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  return `Basic ${value}`;
}
