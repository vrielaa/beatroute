import "express-session";

declare module "express-session" {
  interface SessionData {
    lastfm: {
      username: string;
    };
    spotify: {
      accessToken: string;
    };
  }
}
