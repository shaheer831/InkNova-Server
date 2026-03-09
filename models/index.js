/**
 * models/index.js
 * All Mongoose models for the SaaS backend.
 *
 * Changes:
 *  - Roles are fully dynamic (stored in DB, referenced by ObjectId)
 *  - No static role strings — role field removed, only roleId used
 *  - Permissions are evaluated directly from user.permissions + roleId.permissions
 *  - SuperAdmin is identified by email (process.env.SUPER_ADMIN_EMAIL), never deletable
 */
import mongoose from "mongoose";

const { Schema, model } = mongoose;

/* ================================================
   USER
   ================================================ */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    picture: {
      url: String,
      originalName: String,
      size: Number,
    },

    // Direct permissions assigned to this user (override/extend role permissions)
    permissions: { type: [String], default: [] },

    // Dynamic role reference — determines base permission set
    roleId: { type: Schema.Types.ObjectId, ref: "Role", default: null },

    isActive: { type: Boolean, default: true },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    refreshToken: { type: String },
  },
  { timestamps: true }
);

userSchema.virtual("isLocked").get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

/**
 * Returns the merged permission set: role permissions + direct user permissions.
 * Call after populating roleId.
 */
userSchema.methods.getEffectivePermissions = function () {
  const rolePerms = this.roleId?.permissions || [];
  return [...new Set([...rolePerms, ...this.permissions])];
};

/**
 * Check if user has a specific permission (from role or direct assignment).
 * Call after populating roleId.
 */
userSchema.methods.hasPermission = function (permission) {
  return this.getEffectivePermissions().includes(permission);
};

export const User = model("User", userSchema);

/* ================================================
   CATEGORY
   ================================================ */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true },
    description: String,
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Category = model("Category", categorySchema);

/* ================================================
   BOOK
   ================================================ */
const bookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true },
    description: String,

    pdfFile: {
      url: String,
      originalName: String,
      size: Number,
    },

    coverImage: {
      url: String,
      originalName: String,
    },

    showcaseImages: {
      type: [{ url: String, originalName: String }],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: "Maximum 5 showcase images allowed",
      },
    },

    price: { type: Number, default: 0 },
    pagesCount: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    categories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    tags: [String],
  },
  { timestamps: true }
);
export const Book = model("Book", bookSchema);

/* ================================================
   WISHLIST
   ================================================ */
const wishlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  },
  { timestamps: true }
);
export const Wishlist = model("Wishlist", wishlistSchema);

/* ================================================
   BOOKMARK
   ================================================ */
const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    bookId: { type: Schema.Types.ObjectId, ref: "Book" },
  },
  { timestamps: true }
);
export const Bookmark = model("Bookmark", bookmarkSchema);

/* ================================================
   ORDER  — COD ONLY
   ================================================ */
const orderItemSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: "Book" },
  quantity: { type: Number, default: 1 },
  price: Number,
});

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    paymentMethod: { type: String, enum: ["COD"], default: "COD" },
    status: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "PKR" },
    items: [orderItemSchema],
    discountCode: String,
    discountAmount: { type: Number, default: 0 },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: String,
      city: { type: String, required: true },
      state: String,
      postalCode: String,
      country: { type: String, default: "Pakistan" },
    },
    codCollected: { type: Boolean, default: false },
    codCollectedAt: Date,
    notes: String,
  },
  { timestamps: true }
);
export const Order = model("Order", orderSchema);

/* ================================================
   INVENTORY
   ================================================ */
const inventorySchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true, unique: true },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    warehouseLocation: String,
  },
  { timestamps: true }
);
export const Inventory = model("Inventory", inventorySchema);

/* ================================================
   PRODUCTION BATCH
   ================================================ */
const productionSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    quantity: Number,
    status: { type: String, enum: ["planned", "printing", "completed"], default: "planned" },
    startDate: Date,
    endDate: Date,
    notes: String,
  },
  { timestamps: true }
);
export const ProductionBatch = model("ProductionBatch", productionSchema);

/* ================================================
   VENDOR
   ================================================ */
const vendorSchema = new Schema(
  {
    name: { type: String, required: true },
    email: String,
    phone: String,
    address: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Vendor = model("Vendor", vendorSchema);

/* ================================================
   MATERIAL
   ================================================ */
const materialSchema = new Schema(
  {
    name: { type: String, required: true },
    unit: String,
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
  },
  { timestamps: true }
);
export const Material = model("Material", materialSchema);

/* ================================================
   DISCOUNT
   ================================================ */
const discountSchema = new Schema(
  {
    code: { type: String, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percentage", "fixed"] },
    value: Number,
    expiryDate: Date,
    usageLimit: Number,
    usageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Discount = model("Discount", discountSchema);

/* ================================================
   ROLE  — fully dynamic, stored in DB
   ================================================ */
const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    permissions: { type: [String], default: [] },
    // Optional: mark as system role to prevent deletion via UI (but not superadmin check)
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const Role = model("Role", roleSchema);

/* ================================================
   ACTIVITY LOG
   ================================================ */
const activitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: String,
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);
export const ActivityLog = model("ActivityLog", activitySchema);