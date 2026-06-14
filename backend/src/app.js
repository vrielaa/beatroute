import express from "express";
import session from "express-session";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import openapiDocument from "./docs/openapi.json" with { type: "json" };

import { validateEnv } from "./utils/validateEnv.js";

import {
  FRONTEND_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SESSION_SECRET,
  IS_PRODUCTION,
} from "./config/spotify.config.js";

import {
  SOUNDCHARTS_APP_ID,
  SOUNDCHARTS_API_KEY,
} from './config/soundcharts.config.js';

import authRoutes from "./integrations/routes/auth.routes.js";
import sessionRoutes from "./integrations/routes/session.routes.js";
import meRoutes from "./integrations/routes/me.routes.js";
import tracksRoutes from "./integrations/routes/track.routes.js";
import lastfmRoutes from "./integrations/routes/lastfm.routes.js";

const requiredEnvVars = {
  FRONTEND_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SESSION_SECRET,
  SOUNDCHARTS_APP_ID,
  SOUNDCHARTS_API_KEY,
};

validateEnv(requiredEnvVars);

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use(
    cors({
      origin: FRONTEND_URL,
      credentials: true,
    })
  );

  app.use(
    session({
      name: "sessionId",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24,
      },
    })
  );

  app.get("/test", (req, res) => {
    res.send("backend works");
  });

  app.use("/auth", authRoutes);
  app.use("/api/auth", sessionRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/tracks", tracksRoutes);
  app.use("/api/lastfm", lastfmRoutes);

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
}
