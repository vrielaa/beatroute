import { HttpError } from "../../../http/error-response.js";
import type { Request, Response, NextFunction } from "express";

/**
 * Przepuszcza żądanie tylko wtedy, gdy sesja zawiera połączenie z Last.fm.
 *
 * @param req - Żądanie zawierające sesję użytkownika.
 * @param res - Odpowiedź Express wymagana przez kontrakt middleware.
 * @param next - Funkcja przekazująca sterowanie albo błąd do kolejnej warstwy.
 */
export default function ensureLastfmSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
