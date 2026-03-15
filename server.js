/**
 * server.js
 * InkNova — Digital Book Reading Platform
 * Express app bootstrap
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Static file serving — only useful in development (Vercel has no persistent disk)
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
}

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// ── Health ─────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    platform: "InkNova Reading Platform",
    timestamp: new Date().toISOString(),
  });
});

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

// ── Start ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();
  logger.info(`Loaded ${VALID_PERMISSIONS.length} permissions: ${VALID_PERMISSIONS.join(", ")}`);
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
};

start();

export default app;
