export const LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/";
export const LASTFM_AUTH_URL = "https://www.last.fm/api/auth/";

export const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
export const LASTFM_SHARED_SECRET = process.env.LASTFM_SHARED_SECRET;
export const LASTFM_REDIRECT_URI = process.env.LASTFM_REDIRECT_URI;
export const LASTFM_USER_AGENT =
  process.env.LASTFM_USER_AGENT || "BeatRoute/1.0";

export function assertLastfmConfig() {
  const requiredConfig = {
    LASTFM_API_KEY,
    LASTFM_SHARED_SECRET,
    LASTFM_REDIRECT_URI,
  };

  for (const [key, value] of Object.entries(requiredConfig)) {
    if (!value) {
      throw new Error(`Brakuje zmiennej środowiskowej Last.fm: ${key}`);
    }
  }
}
