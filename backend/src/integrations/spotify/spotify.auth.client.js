import { appConfig } from "../../config/app.config.js";
import { getSpotifyBasicAuthHeader } from "../../utils/spotify-basic-auth.js";

export class SpotifyAuthApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "SpotifyAuthApiError";
    this.status = status;
    this.data = data;
  }
}

export function createSpotifyAuthClient({
  fetchImpl = globalThis.fetch,
  tokenUrl = "https://accounts.spotify.com/api/token",
  basicAuthHeader = getSpotifyBasicAuthHeader(),
  redirectUri = appConfig.spotify.redirectUri,
} = {}) {
  async function requestToken(params) {
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new SpotifyAuthApiError(
        data?.error_description || "Nie udało się pobrać tokena Spotify",
        response.status,
        data
      );
    }

    return data;
  }

  function exchangeAuthorizationCode(code) {
    return requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  }

  function refreshAccessToken(refreshToken) {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  return { exchangeAuthorizationCode, refreshAccessToken };
}

const defaultSpotifyAuthClient = createSpotifyAuthClient();

export const exchangeSpotifyAuthorizationCode =
  defaultSpotifyAuthClient.exchangeAuthorizationCode;
export const refreshSpotifyAccessToken =
  defaultSpotifyAuthClient.refreshAccessToken;
