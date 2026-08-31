import { Router } from "express";
import crypto from "crypto";
import { appConfig } from "../../../config/app.config.js";
import { defaultSpotifyAuthClient } from "../../spotify/spotify.auth.client.js";
import { HttpError } from "@http/error-response.js";
import { regenerateSession, saveSession } from "@http/session.js";
import type { Session } from "express-session";
import type { SpotifyAuthClient } from "../../spotify/spotify.auth.types.js";

type SpotifyAuthRouterConfig = {
  clientId: string;
  redirectUri: string;
  frontendUrl: string;
  scopes: readonly string[];
};

type SpotifyAuthRouterDependencies = {
  authClient: SpotifyAuthClient;
  config: SpotifyAuthRouterConfig;
  createState: () => string;
  save: (session: Session) => Promise<void>;
  regenerate: (session: Session) => Promise<void>;
  now: () => number;
};

/** Tworzy router OAuth Spotify z jawnymi, zastępowalnymi zależnościami. */
function createSpotifyAuthRouter({
  authClient,
  config,
  createState,
  save,
  regenerate,
  now,
}: SpotifyAuthRouterDependencies) {
  const router = Router();

  /**
   * Kończy autoryzację Spotify po powrocie użytkownika z formularza zgody.
   * Weryfikuje odpowiedź i stan żądania, wymienia jednorazowy kod na tokeny,
   * a następnie zapisuje dane dostępowe Spotify w sesji aplikacji.
   */
  router.get("/callback", async (req, res) => {
    /**
     * Parametry przekazane przez Spotify w adresie callbacku:
     * `code` jest jednorazowym kodem wymienianym na tokeny dostępowe,
     * `state` identyfikuje rozpoczęty w tej sesji proces autoryzacji,
     * a `error` informuje, że użytkownik odmówił dostępu lub proces się nie udał.
     */
    const { code, state, error } = req.query;

    if (error !== undefined) {
      const errorMessage =
        typeof error === "string" ? error : "authorization_denied";

      throw new HttpError(
        400,
        "SPOTIFY_AUTH_DENIED",
        `Spotify auth error: ${errorMessage}`
      );
    }

    if (typeof code !== "string" || typeof state !== "string") {
      throw new HttpError(
        400,
        "SPOTIFY_AUTH_CALLBACK_INVALID",
        "Brak code albo state"
      );
    }

    if (state !== req.session?.spotifyAuthState) {
      throw new HttpError(400, "SPOTIFY_AUTH_STATE_MISMATCH", "State mismatch");
    }

    const tokenData = await authClient.exchangeAuthorizationCode(code);

    await regenerate(req.session);

    req.session.spotify = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
      tokenType: tokenData.token_type,
    };

    delete req.session.spotifyAuthState;

    await save(req.session);

    res.redirect(`${config.frontendUrl}/`);
  });

  /**
   * Rozpoczyna autoryzację Spotify.
   * Tworzy losowy parametr `state`, zapisuje go w sesji i przekierowuje
   * użytkownika do formularza zgody Spotify z wymaganymi zakresami dostępu.
   */
  router.get("/login", async (req, res) => {
    const state = createState();
    req.session.spotifyAuthState = state;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      scope: config.scopes.join(" "),
      redirect_uri: config.redirectUri,
      state,
      show_dialog: "true",
    });

    await save(req.session);

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });

  return router;
}

const spotifyAuthRouter = createSpotifyAuthRouter({
  authClient: defaultSpotifyAuthClient,
  config: {
    clientId: appConfig.spotify.clientId,
    redirectUri: appConfig.spotify.redirectUri,
    frontendUrl: appConfig.server.frontendUrl,
    scopes: appConfig.spotify.scopes,
  },
  createState: () => crypto.randomBytes(16).toString("hex"),
  save: saveSession,
  regenerate: regenerateSession,
  now: Date.now,
});

export { createSpotifyAuthRouter };
export type { SpotifyAuthRouterDependencies, SpotifyAuthRouterConfig };
export default spotifyAuthRouter;
