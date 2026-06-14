import { Router } from "express";

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

router.post("/lastfm/logout", (req, res) => {
  delete req.session.lastfm;
  delete req.session.lastfmAuthState;

  req.session.save((error) => {
    if (error) {
      console.error("Last.fm disconnect error:", error);
      return res.status(500).json({
        message: "Nie udało się odłączyć konta Last.fm",
      });
    }

    res.status(200).json({
      message: "Konto Last.fm zostało odłączone",
    });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ message: "Failed to log out" });
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ message: "Logged out successfully" });
  });
});

export default router;
