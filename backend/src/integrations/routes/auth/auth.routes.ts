import { Router } from "express";
import spotifyAuthRouter from "./spotify-auth.routes.js";
import lastfmAuthRouter from "./lastfm-auth.routes.js";

const authRouter = Router();

/** Obsługuje rozpoczęcie i zakończenie autoryzacji Spotify. */
authRouter.use("/spotify", spotifyAuthRouter);

/** Obsługuje rozpoczęcie i zakończenie autoryzacji Last.fm. */
authRouter.use("/lastfm", lastfmAuthRouter);

export default authRouter;
