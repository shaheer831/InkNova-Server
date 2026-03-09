
/**
 * routes/bookRoutes.js
 */
import { Router } from "express";
import {
  createBook, getBookById, updateBook, deleteBook,
  listBooks, bulkDeleteBooks, toggleBookStatus, searchBooks,
} from "../controllers/bookController.js";
import { verifyToken, requirePermission, optionalAuth } from "../middlewares/auth.js";
import { bookUpload } from "../middlewares/upload.js";

const router = Router();

// Public
router.get("/", optionalAuth, listBooks);
router.get("/search", optionalAuth, searchBooks);
router.get("/:id", optionalAuth, getBookById);

// Protected
router.post("/", verifyToken, requirePermission("add-books"), bookUpload, createBook);
router.put("/:id", verifyToken, requirePermission("edit-books"), bookUpload, updateBook);
router.patch("/:id/toggle-status", verifyToken, requirePermission("publish-books"), toggleBookStatus);
router.delete("/bulk", verifyToken, requirePermission("delete-books"), bulkDeleteBooks);
router.delete("/:id", verifyToken, requirePermission("delete-books"), deleteBook);

export default router;