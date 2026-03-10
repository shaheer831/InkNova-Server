/**
 * utils/cloudinary.js
 * Cloudinary upload helper.
 *
 * Usage:
 *   import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
 *
 *   const result = await uploadToCloudinary(buffer, { folder: "books/covers", mimetype: "image/jpeg" });
 *   result.url      → secure CDN URL to store in DB
 *   result.publicId → store this too if you want to delete later
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary.
 * @param {Buffer} buffer        - file buffer from multer memoryStorage
 * @param {object} options
 * @param {string} options.folder   - Cloudinary folder, e.g. "inknova/covers"
 * @param {string} options.mimetype - file mimetype, e.g. "image/png", "application/pdf"
 * @param {string} [options.publicId] - optional fixed public_id (auto-generated if omitted)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadToCloudinary = (buffer, { folder, mimetype, publicId }) => {
  return new Promise((resolve, reject) => {
    const resourceType = mimetype === "application/pdf" ? "raw" : "image";

    const uploadOptions = {
      folder,
      resource_type: resourceType,
      ...(publicId && { public_id: publicId }),
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) return reject(error);
      resolve({ url: result.secure_url, publicId: result.public_id });
    });

    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary by its public_id.
 * @param {string} publicId
 * @param {"image"|"raw"} [resourceType="image"]
 */
export const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};
