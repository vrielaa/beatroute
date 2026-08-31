import { Router } from "express";
import crypto from "crypto";
import { appConfig } from "../../config/app.config.js";
import { defaultSpotifyAuthClient } from "../spotify/spotify.auth.client.js";
import { assertLastfmConfig } from "../../config/lastfm.config.js";
import { createLastfmSession } from "../lastfm/lastfm.service.js";
import { HttpError } from "../../http/error-response.js";
import { saveSession } from "../../http/session.js";

const router = Router();

router.get("/spotify/login", async (req, res) => {
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

router.get("/spotify/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    throw new HttpError(
      400,
      "SPOTIFY_AUTH_DENIED",
      `Spotify auth error: ${error}`
    );
  }

  if (!code || !state) {
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

router.get("/lastfm/login", async (req, res) => {
  try {
    assertLastfmConfig();
  } catch (error) {
    throw new HttpError(
      503,
      "LASTFM_CONFIGURATION_ERROR",
      error instanceof Error ? error.message : "Błąd konfiguracji Last.fm"
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const callbackUrl = new URL(appConfig.lastfm.redirectUri);
  const authorizationUrl = new URL(appConfig.lastfm.authUrl);

  callbackUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("api_key", appConfig.lastfm.apiKey);
  authorizationUrl.searchParams.set("cb", callbackUrl.toString());

  req.session.lastfmAuthState = state;

  await saveSession(req.session);

  res.redirect(authorizationUrl.toString());
});

router.get("/lastfm/callback", async (req, res) => {
  const { token, state } = req.query;

  if (typeof token !== "string" || typeof state !== "string") {
    throw new HttpError(
      400,
      "LASTFM_AUTH_CALLBACK_INVALID",
      "Brak tokenu lub state w odpowiedzi Last.fm"
    );
  }

  if (state !== req.session.lastfmAuthState) {
    throw new HttpError(
      400,
      "LASTFM_AUTH_STATE_MISMATCH",
      "Nieprawidłowy state autoryzacji Last.fm"
    );
  }

  delete req.session.lastfmAuthState;

  const lastfmSession = await createLastfmSession(token);

  req.session.lastfm = {
    sessionKey: lastfmSession.key,
    username: lastfmSession.name,
    subscriber: lastfmSession.subscriber === "1",
  };

  await saveSession(req.session);

  res.redirect(`${appConfig.server.frontendUrl}/`);
});

export default router;
