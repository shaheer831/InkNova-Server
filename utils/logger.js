/**
 * utils/logger.js
 * Winston logger setup for structured application logging.
 * Logs to console always; file transports only in development
 * (Vercel's filesystem is read-only in production).
 */
import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
  ],
});

// In development only: write logs to files (production filesystem is read-only on Vercel)
if (process.env.NODE_ENV !== "production") {
  const logsDir = path.join(__dirname, "../logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  logger.add(
    new winston.transports.File({
      filename: path.join(__dirname, "../logs/error.log"),
      level: "error",
    })
  );
  logger.add(
    new winston.transports.File({
      filename: path.join(__dirname, "../logs/combined.log"),
    })
  );
}

export default logger;
