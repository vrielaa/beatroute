import { Router } from "express";
import authRoutes from "./auth/routes.js";
import meRoutes from "./me/routes.js";
import sessionRoutes from "./session.routes.js";
import tracksRoutes from "./track/track.routes.js";
import lastfmRoutes from "./lastfm.routes.js";
import musicMapRoutes from "./music-map/routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/me", meRoutes);
router.use("/session", sessionRoutes);
router.use("/tracks", tracksRoutes);
router.use("/lastfm", lastfmRoutes);
router.use("/music-map", musicMapRoutes);

export default router;
