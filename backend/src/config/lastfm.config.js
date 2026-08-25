import { appConfig } from "./app.config.js";

export function assertLastfmConfig(config = appConfig.lastfm) {
  const requiredConfig = {
    LASTFM_API_KEY: config.apiKey,
    LASTFM_SHARED_SECRET: config.sharedSecret,
    LASTFM_REDIRECT_URI: config.redirectUri,
  };

  for (const [key, value] of Object.entries(requiredConfig)) {
    if (!value) {
      throw new Error(`Brakuje zmiennej środowiskowej Last.fm: ${key}`);
    }
  }
}
