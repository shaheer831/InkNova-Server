/**
 * server.js
 * InkNova — Digital Book Reading Platform
 * Express app bootstrap — Vercel-compatible (serverless)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";

import connectDB from "./config/db.js";
import { VALID_PERMISSIONS } from "./config/permissions.js";
import logger from "./utils/logger.js";
import errorHandler from "./middlewares/errorHandler.js";

// ── Admin routes ──────────────────────────────────
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";
import chapterRoutes from "./routes/chapterRoutes.js";
import seriesRoutes from "./routes/seriesRoutes.js";
import genreRoutes from "./routes/genreRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reviewAdminRoutes from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import discountRoutes from "./routes/discountRoutes.js";

// ── Client (reader) routes ────────────────────────
import readerRoutes from "./routes/readerRoutes.js";

const app = express();

// ── CORS — allow all origins, all methods (no restrictions) ──────────
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"],
  exposedHeaders: ["*"],
  credentials: false,
};
app.use(cors(corsOptions));
app.options("*", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  });
  res.sendStatus(204);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Admin API routes ───────────────────────────────
const API = "/api";
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/customers`, customerRoutes);
app.use(`${API}/books`, bookRoutes);
app.use(`${API}/books/:bookId/chapters`, chapterRoutes); // nested: /api/books/:bookId/chapters
app.use(`${API}/chapters`, chapterRoutes);               // flat: /api/chapters/:id  (bookId in body/query)
app.use(`${API}/series`, seriesRoutes);
app.use(`${API}/genres`, genreRoutes);
app.use(`${API}/roles`, roleRoutes);
app.use(`${API}/activity`, activityRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/reviews`, reviewAdminRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/discounts`, discountRoutes);

// ── Client (reader) routes ─────────────────────────
app.use(`${API}/reader`, readerRoutes);

// ── 404 ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ── Error handler ──────────────────────────────────
app.use(errorHandler);

// ── DB connection (cached for serverless warm reuse) ──────────────────
let dbConnected = false;
const ensureDB = async () => {
  if (!dbConnected) {
    await connectDB();
    logger.info(`Loaded ${VALID_PERMISSIONS.length} permissions`);
    dbConnected = true;
  }
};

// ── Local dev: start server normally ──────────────────────────────────
// On Vercel this block is skipped; the exported `app` is used directly.
if (process.env.NODE_ENV !== "production" || process.env.FORCE_SERVER) {
  const PORT = parseInt(process.env.PORT) || 5000;
  await ensureDB();
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
} else {
  // Vercel: connect DB once on cold start
  await ensureDB();
}

export default app;
