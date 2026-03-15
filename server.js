/**
 * server.js
 * InkNova — Digital Book Reading Platform
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

import authRoutes         from "./routes/authRoutes.js";
import userRoutes         from "./routes/userRoutes.js";
import customerRoutes     from "./routes/customerRoutes.js";
import bookRoutes         from "./routes/bookRoutes.js";
import chapterRoutes      from "./routes/chapterRoutes.js";
import seriesRoutes       from "./routes/seriesRoutes.js";
import genreRoutes        from "./routes/genreRoutes.js";
import roleRoutes         from "./routes/roleRoutes.js";
import activityRoutes     from "./routes/activityRoutes.js";
import dashboardRoutes    from "./routes/dashboardRoutes.js";
import reviewAdminRoutes  from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import discountRoutes     from "./routes/discountRoutes.js";
import readerRoutes       from "./routes/readerRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── CORS — must be FIRST, before everything including helmet ──────────────────
// Handle preflight OPTIONS immediately and return 204
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24h
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// ── Helmet — with all cross-origin policies disabled so they don't fight CORS ─
app.use(
  helmet({
    crossOriginResourcePolicy:  false,
    crossOriginOpenerPolicy:    false,
    crossOriginEmbedderPolicy:  false,
    contentSecurityPolicy:      false,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
}

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", platform: "InkNova", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
const API = "/api";
app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/users`,         userRoutes);
app.use(`${API}/customers`,     customerRoutes);
app.use(`${API}/books`,         bookRoutes);
app.use(`${API}/books/:bookId/chapters`, chapterRoutes);
app.use(`${API}/chapters`,      chapterRoutes);
app.use(`${API}/series`,        seriesRoutes);
app.use(`${API}/genres`,        genreRoutes);
app.use(`${API}/roles`,         roleRoutes);
app.use(`${API}/activity`,      activityRoutes);
app.use(`${API}/dashboard`,     dashboardRoutes);
app.use(`${API}/reviews`,       reviewAdminRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/discounts`,     discountRoutes);
app.use(`${API}/reader`,        readerRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();
  logger.info(`Loaded ${VALID_PERMISSIONS.length} permissions`);
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
};

start();

export default app;
