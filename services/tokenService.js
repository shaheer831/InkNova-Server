/**
 * services/tokenService.js
 * Handles JWT access token and refresh token generation/verification.
 * Refresh tokens are hashed (SHA-256) before storage for security.
 */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/index.js";

/**
 * Hash a token string with SHA-256.
 * @param {string} token
 * @returns {string} hex digest
 */
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Generate a short-lived access token.
 * @param {string} userId
 * @returns {string} signed JWT
 */
export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });
};

/**
 * Generate a long-lived refresh token, hash it, and persist the hash.
 * @param {string} userId
 * @returns {string} raw signed refresh JWT (sent to client)
 */
export const generateRefreshToken = async (userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
  await User.findByIdAndUpdate(userId, { refreshToken: hashToken(token) });
  return token;
};

/**
 * Verify a refresh token and return a new access token + rotated refresh token.
 * Validates the token signature and that its hash matches what's stored.
 * @param {string} token
 * @returns {{ accessToken: string, refreshToken: string, user: Document }}
 */
export const refreshAccessToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.id);

  if (!user || user.refreshToken !== hashToken(token)) {
    throw Object.assign(new Error("Invalid refresh token"), { statusCode: 401 });
  }

  if (!user.isActive) {
    throw Object.assign(new Error("Account is deactivated"), { statusCode: 403 });
  }

  const accessToken = generateAccessToken(user._id);
  const newRefreshToken = await generateRefreshToken(user._id);
  return { accessToken, refreshToken: newRefreshToken, user };
};

/**
 * Invalidate a user's refresh token (logout).
 * @param {string} userId
 */
export const invalidateRefreshToken = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};
