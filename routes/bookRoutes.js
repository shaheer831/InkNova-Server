import { Router } from "express";
import {
  createBook, getBookById, updateBook, deleteBook, listBooks,
  bulkDeleteBooks, toggleBookStatus, toggleFeatured, searchBooks, listBooksAll,
} from "../controllers/bookController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";
import { bookImageUpload } from "../middlewares/upload.js";

const router = Router();

router.get("/all", listBooksAll);
router.get("/search", searchBooks);
router.get("/", listBooks);
router.get("/:id", getBookById);

router.post("/", verifyToken, requirePermission("add-books"), bookImageUpload, createBook);
router.put("/:id", verifyToken, requirePermission("edit-books"), bookImageUpload, updateBook);
router.patch("/:id/toggle-status", verifyToken, requirePermission("publish-books"), toggleBookStatus);
router.patch("/:id/toggle-featured", verifyToken, requirePermission("edit-books"), toggleFeatured);
router.delete("/bulk", verifyToken, requirePermission("delete-books"), bulkDeleteBooks);
router.delete("/:id", verifyToken, requirePermission("delete-books"), deleteBook);

export default router;
