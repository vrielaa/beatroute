export const PORT = Number(process.env.PORT ?? 3000);
export const FRONTEND_URL = process.env.FRONTEND_URL;
export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
export const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
export const SESSION_SECRET = process.env.SESSION_SECRET;

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SCOPES = [
  "user-top-read",
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "playlist-modify-private",
];
