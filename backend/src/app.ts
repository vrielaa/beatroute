import express from "express";
import session from "express-session";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import openapiDocument from "./docs/openapi.json" with { type: "json" };
import { validateEnv } from "./utils/validateEnv.js";

import { appConfig, type AppConfig } from "./config/app.config.js";

import authRoutes from "@http/routes/auth/routes.js";
import sessionRoutes from "@http/routes/session/routes.js";
import meRoutes from "@http/routes/me/routes.js";
import tracksRoutes from "@http/routes/tracks/routes.js";
import lastfmRoutes from "@http/routes/lastfm/routes.js";
import musicMapRoutes from "@http/routes/music-map/routes.js";
import playlistGeneratorRoutes from "@http/routes/playlist-generator/routes.js";
import { errorHandler, notFoundHandler } from "@http/error-handler.js";

function validateAppConfig(config: AppConfig) {
  validateEnv({
    FRONTEND_URL: config.server.frontendUrl,
    SPOTIFY_CLIENT_ID: config.spotify.clientId,
    SPOTIFY_CLIENT_SECRET: config.spotify.clientSecret,
    SPOTIFY_REDIRECT_URI: config.spotify.redirectUri,
    SESSION_SECRET: config.server.sessionSecret,
    SOUNDCHARTS_APP_ID: config.soundcharts.appId,
    SOUNDCHARTS_API_KEY: config.soundcharts.apiKey,
    LASTFM_API_KEY: config.lastfm.apiKey,
    LASTFM_REDIRECT_URI: config.lastfm.redirectUri,
    LASTFM_SHARED_SECRET: config.lastfm.sharedSecret,
  });

  if (!config.server.isProduction) {
    return;
  }

  throw new Error(
    "NODE_ENV=production wymaga zewnętrznego store dla express-session; MemoryStore jest tylko do lokalnego developmentu"
  );
}

function createApp(config = appConfig) {
  validateAppConfig(config);

  const app = express();

  app.use("/api/playlist-generator", express.json({ limit: "1mb" }));

  app.use(
    express.json({
      limit: "100kb",
    })
  );

  app.use(
    cors({
      origin: config.server.frontendUrl,
      credentials: true,
    })
  );

  app.use(
    session({
      name: "sessionId",
      secret: config.server.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: config.server.isProduction ? "none" : "lax",
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
  app.use("/api/music-map", musicMapRoutes);
  app.use("/api/playlist-generator", playlistGeneratorRoutes);

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { createApp };
