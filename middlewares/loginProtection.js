/**
 * middlewares/loginProtection.js
 * Tracks failed login attempts per user account.
 * Locks the account after MAX_LOGIN_ATTEMPTS failures for LOCK_TIME_MINUTES.
 *
 * Exported helpers:
 *   handleFailedLogin(user)   - increment attempts and lock if needed
 *   handleSuccessfulLogin(user) - reset attempts after successful login
 */
import { User } from "../models/index.js";

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCK_MINUTES = parseInt(process.env.LOCK_TIME_MINUTES) || 15;

/**
 * Increment failed login count. Lock account when threshold reached.
 * @param {Document} user - Mongoose User document
 */
export const handleFailedLogin = async (user) => {
  const updates = { $inc: { loginAttempts: 1 } };

  // Lock if this attempt hits the threshold
  if (user.loginAttempts + 1 >= MAX_ATTEMPTS) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) };
  }

  await User.updateOne({ _id: user._id }, updates);
};

/**
 * Reset login attempts and lock after successful authentication.
 * @param {Document} user - Mongoose User document
 */
export const handleSuccessfulLogin = async (user) => {
  if (user.loginAttempts > 0 || user.lockUntil) {
    await User.updateOne(
      { _id: user._id },
      { $set: { loginAttempts: 0, lockUntil: null } }
    );
  }
};
