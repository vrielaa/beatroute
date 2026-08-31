import { Router } from "express";
import crypto from "crypto";
import { appConfig } from "../../../config/app.config.js";
import { defaultSpotifyAuthClient } from "../../spotify/spotify.auth.client.js";
import { HttpError } from "@http/error-response.js";
import { saveSession } from "@http/session.js";

const spotifyAuthRouter = Router();

/**
 * Kończy autoryzację Spotify po powrocie użytkownika z formularza zgody.
 * Weryfikuje odpowiedź i stan żądania, wymienia jednorazowy kod na tokeny,
 * a następnie zapisuje dane dostępowe Spotify w sesji aplikacji.
 */
spotifyAuthRouter.get("/callback", async (req, res) => {
  /**
   * Parametry przekazane przez Spotify w adresie callbacku:
   * `code` jest jednorazowym kodem wymienianym na tokeny dostępowe,
   * `state` identyfikuje rozpoczęty w tej sesji proces autoryzacji,
   * a `error` informuje, że użytkownik odmówił dostępu lub proces się nie udał.
   */
  const { code, state, error } = req.query;

  if (error) {
    throw new HttpError(
      400,
      "SPOTIFY_AUTH_DENIED",
      `Spotify auth error: ${error}`
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

  const tokenData =
    await defaultSpotifyAuthClient.exchangeAuthorizationCode(code);

  req.session.spotify = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    scope: tokenData.scope,
    tokenType: tokenData.token_type,
  };

  delete req.session.spotifyAuthState;

  await saveSession(req.session);

  res.redirect(`${appConfig.server.frontendUrl}/`);
});

/**
 * Rozpoczyna autoryzację Spotify.
 * Tworzy losowy parametr `state`, zapisuje go w sesji i przekierowuje
 * użytkownika do formularza zgody Spotify z wymaganymi zakresami dostępu.
 */
spotifyAuthRouter.get("/login", async (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.spotifyAuthState = state;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: appConfig.spotify.clientId,
    scope: appConfig.spotify.scopes.join(" "),
    redirect_uri: appConfig.spotify.redirectUri,
    state,
    show_dialog: "true",
  });

  await saveSession(req.session);

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

export default spotifyAuthRouter;
