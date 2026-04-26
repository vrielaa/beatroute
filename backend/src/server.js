import "dotenv/config";
import express from "express";
import session from "express-session";
import cors from "cors";

import {
  PORT,
  FRONTEND_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SESSION_SECRET,
} from "./config/spotify.config.js";

import authRoutes from "./routes/auth.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import meRoutes from "./routes/me.routes.js";

const app = express();

const requiredEnvVars = {
  FRONTEND_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SESSION_SECRET,
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.error(`Brakuje zmiennej środowiskowej: ${key}`);
    process.exit(1);
  }
}

app.use(express.json());

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
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

app.listen(PORT, () => {
  console.log(`Backend działa na porcie ${PORT}`);
});
