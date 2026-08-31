import { Router } from "express";
import crypto from "crypto";
import { appConfig } from "../../../config/app.config.js";
import { assertLastfmConfig } from "../../../config/lastfm.config.js";
import { createLastfmSession } from "../../lastfm/lastfm.service.js";
import { HttpError } from "@http/error-response.js";
import { regenerateSession, saveSession } from "@http/session.js";
import type { Session } from "express-session";

type LastfmSessionData = { key: string; name: string };

type LastfmAuthRouterConfig = {
  apiKey: string;
  authUrl: string;
  redirectUri: string;
  frontendUrl: string;
};

type LastfmAuthRouterDependencies = {
  config: LastfmAuthRouterConfig;
  assertConfig: () => void;
  createSession: (token: string) => Promise<LastfmSessionData>;
  createState: () => string;
  save: (session: Session) => Promise<void>;
  regenerate: (session: Session) => Promise<void>;
};

/** Tworzy router autoryzacji Last.fm z jawnymi zależnościami. */
function createLastfmAuthRouter({
  config,
  assertConfig,
  createSession,
  createState,
  save,
  regenerate,
}: LastfmAuthRouterDependencies) {
  const router = Router();

  /**
   * Kończy autoryzację Last.fm po powrocie użytkownika z formularza zgody.
   * Weryfikuje odpowiedź i stan żądania, wymienia jednorazowy token na trwały
   * klucz sesji Last.fm, a następnie zapisuje go w sesji aplikacji.
   */
  router.get("/callback", async (req, res) => {
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

    const lastfmSession = await createSession(token);

    await regenerate(req.session);

    req.session.lastfm = {
      sessionKey: lastfmSession.key,
      username: lastfmSession.name,
    };

    delete req.session.lastfmAuthState;

    await save(req.session);

    res.redirect(`${config.frontendUrl}/`);
  });

  /**
   * Rozpoczyna autoryzację Last.fm.
   * Sprawdza konfigurację integracji, zapisuje losowy parametr `state` w sesji
   * i przekierowuje użytkownika do formularza zgody Last.fm.
   */
  router.get("/login", async (req, res) => {
    try {
      assertConfig();
    } catch (error) {
      throw new HttpError(
        503,
        "LASTFM_CONFIGURATION_ERROR",
        error instanceof Error ? error.message : "Błąd konfiguracji Last.fm"
      );
    }

    const state = createState();
    const callbackUrl = new URL(config.redirectUri);
    const authorizationUrl = new URL(config.authUrl);

    callbackUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("api_key", config.apiKey);
    authorizationUrl.searchParams.set("cb", callbackUrl.toString());

    req.session.lastfmAuthState = state;

    await save(req.session);

    res.redirect(authorizationUrl.toString());
  });

  return router;
}

const lastfmAuthRouter = createLastfmAuthRouter({
  config: {
    apiKey: appConfig.lastfm.apiKey,
    authUrl: appConfig.lastfm.authUrl,
    redirectUri: appConfig.lastfm.redirectUri,
    frontendUrl: appConfig.server.frontendUrl,
  },
  assertConfig: assertLastfmConfig,
  createSession: createLastfmSession,
  createState: () => crypto.randomBytes(16).toString("hex"),
  save: saveSession,
  regenerate: regenerateSession,
});

export { createLastfmAuthRouter };
export type { LastfmAuthRouterDependencies, LastfmAuthRouterConfig };
export default lastfmAuthRouter;
