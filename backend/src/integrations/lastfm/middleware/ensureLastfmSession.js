import { HttpError } from "../../../http/error-response.js";

export default function ensureLastfmSession(req, res, next) {
  if (!req.session.lastfm?.sessionKey || !req.session.lastfm?.username) {
    return next(
      new HttpError(
        401,
        "LASTFM_AUTH_REQUIRED",
        "Konto Last.fm nie jest połączone"
      )
    );
  }

  next();
}
