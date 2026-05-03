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
