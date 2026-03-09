
/**
 * routes/authRoutes.js
 */
import { Router } from "express";
import { register, login, refresh, logout } from "../controllers/authController.js";
import { verifyToken } from "../middlewares/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", verifyToken, logout);

export default router;