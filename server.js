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

// ── CORS Configuration ────────────────────────────
const allowedOrigins = [
  'https://ink-nova-crm.vercel.app',
  'https://ink-nova-website.vercel.app',
  'http://localhost:3000', // For local development
  'http://localhost:5173', // If using Vite
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Important for cookies/JWT
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Authorization', 'Set-Cookie'],
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours for preflight cache
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add Helmet for security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));


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
    cors: {
      allowedOrigins: allowedOrigins,
      credentials: true
    }
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
    logger.info(`✅ CORS enabled for origins: ${allowedOrigins.join(', ')}`);
  });
};

start();

export default app;