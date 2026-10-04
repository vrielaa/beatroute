import { Router } from "express";
import spotifyAuthRouter from "./spotify.routes.js";
import lastfmAuthRouter from "./lastfm.routes.js";

const authRouter = Router();

/** Obsługuje rozpoczęcie i zakończenie autoryzacji Spotify. */
authRouter.use("/spotify", spotifyAuthRouter);

/** Obsługuje rozpoczęcie i zakończenie autoryzacji Last.fm. */
authRouter.use("/lastfm", lastfmAuthRouter);

export default authRouter;
