/**
 * middlewares/upload.js
 * Multer config — always uses Cloudinary (memory storage).
 * Files are held in memory as buffers and streamed to Cloudinary in controllers.
 */
import multer from "multer";

const imageFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG or WebP images are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const bookImageUpload   = upload.fields([{ name: "coverImage", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }, { name: "showcaseImages", maxCount: 8 }]);
export const seriesImageUpload = upload.fields([{ name: "coverImage", maxCount: 1 }, { name: "bannerImage", maxCount: 1 }]);
export const singleImageUpload = upload.single("coverImage");
export const avatarUpload      = upload.single("picture");
