import { Router } from "express";
import crypto from "crypto";
import { appConfig } from "../../../config/app.config.js";
import { assertLastfmConfig } from "../../../config/lastfm.config.js";
import { createLastfmSession } from "../../lastfm/lastfm.service.js";
import { HttpError } from "@http/error-response.js";
import { saveSession } from "@http/session.js";

const lastfmAuthRouter = Router();

/**
 * Kończy autoryzację Last.fm po powrocie użytkownika z formularza zgody.
 * Weryfikuje odpowiedź i stan żądania, wymienia jednorazowy token na trwały
 * klucz sesji Last.fm, a następnie zapisuje go w sesji aplikacji.
 */
lastfmAuthRouter.get("/callback", async (req, res) => {
  /**
   * Parametry przekazane przez Last.fm w adresie callbacku:
   * `token` jest jednorazowym tokenem służącym do utworzenia sesji Last.fm,
   * a `state` identyfikuje proces autoryzacji rozpoczęty w tej sesji aplikacji.
   */
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
  };

  await saveSession(req.session);

  res.redirect(`${appConfig.server.frontendUrl}/`);
});

/**
 * Rozpoczyna autoryzację Last.fm.
 * Sprawdza konfigurację integracji, zapisuje losowy parametr `state` w sesji
 * i przekierowuje użytkownika do formularza zgody Last.fm.
 */
lastfmAuthRouter.get("/login", async (req, res) => {
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

export default lastfmAuthRouter;
