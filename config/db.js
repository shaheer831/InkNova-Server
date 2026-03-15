/**
 * config/db.js
 * MongoDB connection using Mongoose
 */
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    // Throw instead of process.exit — keeps the serverless function alive for error response
    throw new Error(`Database connection failed: ${error.message}`);
  }
};

export default connectDB;
