/**
 * middlewares/upload.js
 * Multer config for InkNova reading platform.
 * Always uses Cloudinary when credentials are set (dev + prod).
 * Falls back to local disk only if Cloudinary env vars are missing.
 */
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, "../uploads");

// Use Cloudinary whenever the credentials are configured
const useCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

// Always create local dirs as fallback (harmless if unused)
["covers", "banners", "showcase", "avatars", "genres", "series"].forEach((dir) => {
  fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true });
});

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dirs = {
      coverImage:     "covers",
      bannerImage:    "banners",
      showcaseImages: "showcase",
      picture:        "avatars",
    };
    cb(null, path.join(UPLOAD_ROOT, dirs[file.fieldname] || "covers"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});

// Cloudinary = memory storage (buffer sent directly); local = disk
const storage = useCloudinary ? multer.memoryStorage() : diskStorage;

const imageFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG or WebP images are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

export const bookImageUpload   = upload.fields([{ name: "coverImage", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }, { name: "showcaseImages", maxCount: 8 }]);
export const seriesImageUpload = upload.fields([{ name: "coverImage", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }]);
export const singleImageUpload = upload.single("coverImage");
export const avatarUpload      = upload.single("picture");

/** Bool flag controllers can use instead of checking NODE_ENV */
export { useCloudinary };
