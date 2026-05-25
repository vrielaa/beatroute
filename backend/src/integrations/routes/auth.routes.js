import { Router } from "express";
import crypto from "crypto";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  FRONTEND_URL,
  SCOPES,
} from "../../config/spotify.config.js";
import { getSpotifyBasicAuthHeader } from "../../utils/spotify.js";

const router = Router();

router.get("/spotify/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.spotifyAuthState = state;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES.join(" "),
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: "true",
  });

  req.session.save((err) => {
    if (err) {
      console.error("Session save error:", err);
      return res.status(500).json({ message: "Session save failed" });
    }

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });
});



router.get("/spotify/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({ message: `Spotify auth error: ${error}` });
    }

    if (!code || !state) {
      return res.status(400).json({ message: "Brak code albo state" });
    }

    if (state !== req.session?.spotifyAuthState) {
      return res.status(400).json({ message: "State mismatch" });
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    });

    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: getSpotifyBasicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(400).json({
        message: "Nie udało się pobrać tokena",
        spotifyError: tokenData,
      });
    }

    req.session.spotify = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
      tokenType: tokenData.token_type,
    };

    delete req.session.spotifyAuthState;

    req.session.save((err) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Nie udało się zapisać sesji po callbacku" });
      }

      res.redirect(`${FRONTEND_URL}/`);
    });
  } catch (error) {
    console.error("Callback error:", error);
    res.status(500).json({ message: "Błąd callbacku Spotify" });
  }
});

export default router;
