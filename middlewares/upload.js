/**
 * middlewares/upload.js
 * Multer configuration for book file uploads.
 *
 * Accepted uploads per book:
 *   - pdfFile       : 1 PDF (max 50 MB)
 *   - coverImage    : 1 image (max 5 MB)
 *   - showcaseImages: up to 5 images (max 5 MB each)
 *
 * Files are stored in /uploads/<type>/ on disk.
 * In production swap diskStorage for a cloud storage engine (S3, Cloudinary, etc.)
 */
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, "../uploads");

// Ensure upload directories exist
["pdf", "covers", "showcase", "avatars"].forEach((dir) => {
  fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true });
});

/* ── Determine sub-folder by fieldname ──────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dirs = {
      pdfFile: "pdf",
      coverImage: "covers",
      showcaseImages: "showcase",
      picture: "avatars",
    };
    cb(null, path.join(UPLOAD_ROOT, dirs[file.fieldname] || "misc"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});

/* ── File type filter ───────────────────────────── */
const fileFilter = (req, file, cb) => {
  if (file.fieldname === "pdfFile") {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed for pdfFile"), false);
    }
  } else {
    // coverImage, showcaseImages, picture — all must be images
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG or WebP images are allowed"), false);
    }
  }
  cb(null, true);
};

/* ── Multer instance ────────────────────────────── */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max per file
  },
});

/**
 * bookUpload middleware
 * Handles all three book file fields in a single multipart request.
 * Use with: POST /books  and  PUT /books/:id
 */
export const bookUpload = upload.fields([
  { name: "pdfFile", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "showcaseImages", maxCount: 5 },
]);

/**
 * avatarUpload middleware
 * Handles a single profile picture upload for users.
 * Use with: POST /users  and  PUT /users/:id
 */
export const image = upload.single("picture");

/**
 * Helper: convert uploaded files to the schema shape.
 * @param {object} files - req.files from multer
 * @returns {object} partial book update object
 */
export const parseUploadedFiles = (files = {}) => {
  const result = {};

  if (files.pdfFile?.[0]) {
    const f = files.pdfFile[0];
    result.pdfFile = {
      url: `/uploads/pdf/${f.filename}`,
      originalName: f.originalname,
      size: f.size,
    };
  }

  if (files.coverImage?.[0]) {
    const f = files.coverImage[0];
    result.coverImage = {
      url: `/uploads/covers/${f.filename}`,
      originalName: f.originalname,
    };
  }

  if (files.showcaseImages?.length) {
    result.showcaseImages = files.showcaseImages.map((f) => ({
      url: `/uploads/showcase/${f.filename}`,
      originalName: f.originalname,
    }));
  }

  return result;
};

/**
 * Helper: convert an uploaded avatar file to the schema shape.
 * @param {object} file - req.file from multer (single upload)
 * @returns {object|null} picture object or null if no file
 */
export const parseUploadedAvatar = (file) => {
  if (!file) return null;
  return {
    url: `/uploads/avatars/${file.filename}`,
    originalName: file.originalname,
    size: file.size,
  };
};