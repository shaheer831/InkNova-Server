/**
 * server.js
 * Express app bootstrap — v2 (COD only, no artwork/collections/payments).
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

// ── Route imports ─────────────────────────────────
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import productionRoutes from "./routes/productionRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import materialRoutes from "./routes/materialRoutes.js";
import discountRoutes from "./routes/discountRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import websiteRoutes from "./routes/websiteRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── App init ──────────────────────────────────────
const app = express();


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Then static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ── Health check ──────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────
const API = "/api";

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/books`, bookRoutes);
app.use(`${API}/categories`, categoryRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/inventory`, inventoryRoutes);
app.use(`${API}/production`, productionRoutes);
app.use(`${API}/vendors`, vendorRoutes);
app.use(`${API}/materials`, materialRoutes);
app.use(`${API}/discounts`, discountRoutes);
app.use(`${API}/roles`, roleRoutes);
app.use(`${API}/activity`, activityRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
// ── Website (customer-facing) API ─────────────────────────
app.use(`${API}/website`, websiteRoutes);
// ── Admin Notifications ────────────────────────────────────
app.use(`${API}/notifications`, notificationRoutes);
// ── Admin Reviews ──────────────────────────────────────────
app.use(`${API}/reviews`, reviewRoutes);

// ── 404 handler ───────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────
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
