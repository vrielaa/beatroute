import { LastfmApiError } from "./lastfm.client.js";
import { SpotifyApiError } from "../spotify/spotify.service.js";

export function mapLastfmError(error, message) {
  if (error instanceof TypeError) {
    return {
      status: 400,
      body: { message: error.message },
    };
  }

  return {
    status: error instanceof LastfmApiError && error.code === 9 ? 401 : 502,
    body: {
      message,
      lastfmError: error instanceof Error ? error.message : String(error),
      lastfmCode: error instanceof LastfmApiError ? error.code : null,
    },
  };
}

export function mapSpotifyOrLastfmError(error, message) {
  if (error instanceof SpotifyApiError) {
    return {
      status: error.status,
      body: {
        message: error.message,
        spotifyError: error.data,
      },
    };
  }

  return mapLastfmError(error, message);
}
