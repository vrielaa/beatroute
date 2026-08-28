import { appConfig } from "./app.config.js";

/**
 * Sprawdza, czy skonfigurowano dane wymagane przez integrację Last.fm.
 *
 * @param config - Konfiguracja Last.fm, domyślnie pochodząca ze środowiska.
 * @throws {Error} Gdy brakuje klucza API, sekretu albo adresu callbacku.
 */
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
