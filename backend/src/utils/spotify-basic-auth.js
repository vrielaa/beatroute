import { appConfig } from "../config/app.config.js";

export function getSpotifyBasicAuthHeader({
  clientId = appConfig.spotify.clientId,
  clientSecret = appConfig.spotify.clientSecret,
} = {}) {
  const value = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  return `Basic ${value}`;
}
