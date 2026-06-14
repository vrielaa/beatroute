export default function ensureLastfmSession(req, res, next) {
  if (!req.session.lastfm?.sessionKey || !req.session.lastfm?.username) {
    return res.status(401).json({
      message: "Konto Last.fm nie jest połączone",
    });
  }

  next();
}
