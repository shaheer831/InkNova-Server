import { Router } from "express";
import {
  createGenre, getGenreById, updateGenre, deleteGenre, listGenres,
  listGenresAll, toggleGenreActive, bulkDeleteGenres,
} from "../controllers/genreController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";
import { singleImageUpload } from "../middlewares/upload.js";

const router = Router();

router.get("/all", listGenresAll);
router.get("/", listGenres);
router.get("/:id", getGenreById);

router.post("/", verifyToken, requirePermission("add-genres"), singleImageUpload, createGenre);
router.put("/:id", verifyToken, requirePermission("edit-genres"), singleImageUpload, updateGenre);
router.patch("/:id/toggle-active", verifyToken, requirePermission("edit-genres"), toggleGenreActive);
router.delete("/bulk", verifyToken, requirePermission("delete-genres"), bulkDeleteGenres);
router.delete("/:id", verifyToken, requirePermission("delete-genres"), deleteGenre);

export default router;
