import { Router } from "express";
import crypto from "crypto";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  FRONTEND_URL,
  SCOPES,
} from "../../config/spotify.config.js";
import { getSpotifyBasicAuthHeader } from "../../utils/spotify.js";
import {
  LASTFM_API_KEY,
  LASTFM_AUTH_URL,
  LASTFM_REDIRECT_URI,
  assertLastfmConfig,
} from "../../config/lastfm.config.js";
import { createLastfmSession } from "../lastfm/lastfm.service.js";

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

router.get("/lastfm/login", (req, res) => {
  try {
    assertLastfmConfig();

    const state = crypto.randomBytes(16).toString("hex");
    const callbackUrl = new URL(LASTFM_REDIRECT_URI);
    const authorizationUrl = new URL(LASTFM_AUTH_URL);

    callbackUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("api_key", LASTFM_API_KEY);
    authorizationUrl.searchParams.set("cb", callbackUrl.toString());

    req.session.lastfmAuthState = state;

    req.session.save((error) => {
      if (error) {
        console.error("Last.fm session save error:", error);
        return res.status(500).json({
          message: "Nie udało się rozpocząć autoryzacji Last.fm",
        });
      }

      res.redirect(authorizationUrl.toString());
    });
  } catch (error) {
    console.error("Last.fm login error:", error);
    res.status(503).json({
      message:
        error instanceof Error ? error.message : "Błąd konfiguracji Last.fm",
    });
  }
});

router.get("/lastfm/callback", async (req, res) => {
  try {
    const { token, state } = req.query;

    if (typeof token !== "string" || typeof state !== "string") {
      return res.status(400).json({
        message: "Brak tokenu lub state w odpowiedzi Last.fm",
      });
    }

    if (state !== req.session.lastfmAuthState) {
      return res.status(400).json({
        message: "Nieprawidłowy state autoryzacji Last.fm",
      });
    }

    delete req.session.lastfmAuthState;

    const lastfmSession = await createLastfmSession(token);

    req.session.lastfm = {
      sessionKey: lastfmSession.key,
      username: lastfmSession.name,
      subscriber: lastfmSession.subscriber === "1",
    };

    req.session.save((error) => {
      if (error) {
        console.error("Last.fm callback session save error:", error);
        return res.status(500).json({
          message: "Nie udało się zapisać sesji Last.fm",
        });
      }

      res.redirect(`${FRONTEND_URL}/`);
    });
  } catch (error) {
    console.error("Last.fm callback error:", error);
    res.status(502).json({
      message: "Nie udało się utworzyć sesji Last.fm",
      lastfmError: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
