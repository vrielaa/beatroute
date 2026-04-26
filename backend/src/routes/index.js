import { Router } from "express";
import authRoutes from "./auth.routes.js";
import meRoutes from "./me.routes.js";
import sessionRoutes from "./session.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/me", meRoutes);
router.use("/session", sessionRoutes);

export default router;
