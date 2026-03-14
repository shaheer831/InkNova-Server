/**
 * routes/chapterRoutes.js
 * Mounted both as:
 *   /api/books/:bookId/chapters  (nested)
 *   /api/chapters                (flat — bookId in body/query)
 */
import { Router } from "express";
import {
  createChapter, getChapterById, listChapters, updateChapter,
  deleteChapter, reorderChapters, toggleChapterPublish,
} from "../controllers/chapterController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router({ mergeParams: true }); // mergeParams so :bookId is visible from parent router

router.get("/", verifyToken, requirePermission("view-chapters"), listChapters);
router.post("/", verifyToken, requirePermission("add-chapters"), createChapter);
router.put("/reorder", verifyToken, requirePermission("edit-chapters"), reorderChapters);
router.get("/:id", verifyToken, requirePermission("view-chapters"), getChapterById);
router.put("/:id", verifyToken, requirePermission("edit-chapters"), updateChapter);
router.patch("/:id/toggle-publish", verifyToken, requirePermission("publish-chapters"), toggleChapterPublish);
router.delete("/:id", verifyToken, requirePermission("delete-chapters"), deleteChapter);

export default router;
