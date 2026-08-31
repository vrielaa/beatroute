import { Router } from "express";
import { destroySession, saveSession } from "@http/session.js";
import type { Session } from "express-session";

type SessionRouterDependencies = {
  save: (session: Session) => Promise<void>;
  destroy: (session: Session) => Promise<void>;
  cookieName: string;
};

/** Tworzy router informacji o sesji oraz operacji wylogowania. */
function createSessionRouter({
  save,
  destroy,
  cookieName,
}: SessionRouterDependencies) {
  const router = Router();

  router.get("/me", (req, res) => {
    const isLoggedIn = Boolean(req.session.spotify?.accessToken);

    res.json({ isLoggedIn });
  });

  router.get("/session", (req, res) => {
    res.json({
      sessionID: req.sessionID,
      isLoggedIn: Boolean(req.session.spotify?.accessToken),
      hasRefreshToken: Boolean(req.session.spotify?.refreshToken),
      isLastfmConnected: Boolean(req.session.lastfm?.sessionKey),
    });
  });

  router.get("/lastfm", (req, res) => {
    res.json({
      isConnected: Boolean(req.session.lastfm?.sessionKey),
      username: req.session.lastfm?.username ?? null,
    });
  });

  router.post("/lastfm/logout", async (req, res) => {
    delete req.session.lastfm;
    delete req.session.lastfmAuthState;

    await save(req.session);

    res.status(200).json({
      message: "Konto Last.fm zostało odłączone",
    });
  });

  router.post("/logout", async (req, res) => {
    await destroy(req.session);

    res.clearCookie(cookieName);
    res.status(200).json({ message: "Logged out successfully" });
  });

  return router;
}

const sessionRouter = createSessionRouter({
  save: saveSession,
  destroy: destroySession,
  cookieName: "sessionId",
});

export { createSessionRouter };
export type { SessionRouterDependencies };
export default sessionRouter;
