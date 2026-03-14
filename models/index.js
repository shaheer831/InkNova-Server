/**
 * models/index.js
 * InkNova — Digital Book Reading Platform
 */
import mongoose from "mongoose";
const { Schema, model } = mongoose;

/* ROLE */
const roleSchema = new Schema({ name: { type: String, required: true, unique: true }, permissions: { type: [String], default: [] }, isSystem: { type: Boolean, default: false } }, { timestamps: true });
export const Role = model("Role", roleSchema);

/* USER */
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  picture: { url: String, publicId: String, originalName: String },
  bio: { type: String, maxlength: 500 },
  preferences: {
    fontSize: { type: String, enum: ["sm","md","lg","xl"], default: "md" },
    fontFamily: { type: String, enum: ["serif","sans","mono"], default: "serif" },
    theme: { type: String, enum: ["light","dark","sepia"], default: "light" },
    lineHeight: { type: String, enum: ["normal","relaxed","loose"], default: "relaxed" },
  },
  stats: {
    booksRead: { type: Number, default: 0 },
    chaptersRead: { type: Number, default: 0 },
    totalReadingMinutes: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastReadAt: Date,
  },
  permissions: { type: [String], default: [] },
  roleId: { type: Schema.Types.ObjectId, ref: "Role", default: null },
  isActive: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  refreshToken: { type: String },
  emailVerified: { type: Boolean, default: false },
  passwordResetToken: String,
  passwordResetExpires: Date,
}, { timestamps: true });

userSchema.virtual("isLocked").get(function () { return this.lockUntil && this.lockUntil > Date.now(); });
userSchema.methods.getEffectivePermissions = function () { return [...new Set([...(this.roleId?.permissions||[]), ...this.permissions])]; };
userSchema.methods.hasPermission = function (p) { return this.getEffectivePermissions().includes(p); };
export const User = model("User", userSchema);

/* GENRE */
const genreSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  description: String,
  icon: String,
  color: String,
  coverImage: { url: String, publicId: String },
  parentId: { type: Schema.Types.ObjectId, ref: "Genre", default: null },
  isActive: { type: Boolean, default: true },
  bookCount: { type: Number, default: 0 },
}, { timestamps: true });
export const Genre = model("Genre", genreSchema);

/* SERIES */
const seriesSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  description: String,
  coverImage: { url: String, publicId: String },
  bannerImage: { url: String, publicId: String },
  genres: [{ type: Schema.Types.ObjectId, ref: "Genre" }],
  tags: [String],
  authorName: { type: String, required: true },
  status: { type: String, enum: ["ongoing","completed","hiatus","cancelled"], default: "ongoing" },
  totalVolumes: { type: Number, default: 0 },
  subscriberCount: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
export const Series = model("Series", seriesSchema);

/* BOOK */
const bookSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  description: String,
  synopsis: { type: String, maxlength: 2000 },
  authorName: { type: String, required: true },
  authorBio: String,
  coverImage: { url: String, publicId: String, originalName: String },
  bannerImage: { url: String, publicId: String },
  showcaseImages: {
    type: [{ url: String, publicId: String, originalName: String }],
    validate: { validator: (a) => a.length <= 8, message: "Max 8 showcase images" },
  },
  genres: [{ type: Schema.Types.ObjectId, ref: "Genre" }],
  tags: [String],
  language: { type: String, default: "English" },
  ageRating: { type: String, enum: ["all","teen","mature"], default: "all" },
  seriesId: { type: Schema.Types.ObjectId, ref: "Series", default: null },
  volumeNumber: { type: Number, default: null },
  chapterCount: { type: Number, default: 0 },
  wordCount: { type: Number, default: 0 },
  estimatedReadingMinutes: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  favoriteCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  completionCount: { type: Number, default: 0 },
  status: { type: String, enum: ["draft","published","archived","coming_soon"], default: "draft" },
  publishedAt: Date,
  isFeatured: { type: Boolean, default: false },
  isFree: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
bookSchema.index({ title: "text", description: "text", synopsis: "text", tags: "text" });
bookSchema.index({ genres: 1, status: 1 });
bookSchema.index({ seriesId: 1, volumeNumber: 1 });
bookSchema.index({ likeCount: -1, status: 1 });
bookSchema.index({ averageRating: -1, status: 1 });
export const Book = model("Book", bookSchema);

/* CHAPTER */
const chapterSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  title: { type: String, required: true, trim: true },
  chapterNumber: { type: Number, required: true },
  content: { type: String, required: true },
  wordCount: { type: Number, default: 0 },
  estimatedReadingMinutes: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
  isFree: { type: Boolean, default: true },
  authorNote: String,
  publishedAt: Date,
}, { timestamps: true });
chapterSchema.index({ bookId: 1, chapterNumber: 1 }, { unique: true });
export const Chapter = model("Chapter", chapterSchema);

/* READING PROGRESS */
const readingProgressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  currentChapterId: { type: Schema.Types.ObjectId, ref: "Chapter", default: null },
  currentChapterNumber: { type: Number, default: 0 },
  scrollPosition: { type: Number, default: 0 },
  characterPosition: { type: Number, default: 0 },
  completedChapterNumbers: [Number],
  isCompleted: { type: Boolean, default: false },
  completedAt: Date,
  totalReadingMinutes: { type: Number, default: 0 },
  lastReadAt: { type: Date, default: Date.now },
  readingSessionCount: { type: Number, default: 0 },
}, { timestamps: true });
readingProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
readingProgressSchema.index({ userId: 1, lastReadAt: -1 });
export const ReadingProgress = model("ReadingProgress", readingProgressSchema);

/* BOOKMARK */
const bookmarkSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", required: true },
  chapterNumber: { type: Number, required: true },
  characterPosition: { type: Number, default: 0 },
  scrollPosition: { type: Number, default: 0 },
  note: { type: String, maxlength: 500 },
  label: { type: String, default: "Bookmark" },
  color: { type: String, default: "#f59e0b" },
}, { timestamps: true });
bookmarkSchema.index({ userId: 1, bookId: 1 });
export const Bookmark = model("Bookmark", bookmarkSchema);

/* LIKE */
const likeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
}, { timestamps: true });
likeSchema.index({ userId: 1, bookId: 1 }, { unique: true });
export const Like = model("Like", likeSchema);

/* FAVORITE */
const favoriteSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
}, { timestamps: true });
favoriteSchema.index({ userId: 1, bookId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, createdAt: -1 });
export const Favorite = model("Favorite", favoriteSchema);

/* SUBSCRIPTION */
const subscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  seriesId: { type: Schema.Types.ObjectId, ref: "Series", required: true },
  notifyNewVolume: { type: Boolean, default: true },
  notifyNewChapter: { type: Boolean, default: true },
  notifyStatusChange: { type: Boolean, default: true },
  lastNotifiedAt: Date,
}, { timestamps: true });
subscriptionSchema.index({ userId: 1, seriesId: 1 }, { unique: true });
subscriptionSchema.index({ seriesId: 1 });
export const Subscription = model("Subscription", subscriptionSchema);

/* REVIEW */
const reviewSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  title: { type: String, maxlength: 200 },
  body: { type: String, maxlength: 3000 },
  spoilerWarning: { type: Boolean, default: false },
  status: { type: String, enum: ["pending","approved","rejected"], default: "approved" },
  helpfulCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
}, { timestamps: true });
reviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ bookId: 1, rating: -1 });
export const Review = model("Review", reviewSchema);

/* READING HISTORY */
const readingHistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  minutesRead: { type: Number, default: 0 },
  chaptersRead: { type: Number, default: 0 },
  booksOpened: [{ type: Schema.Types.ObjectId, ref: "Book" }],
}, { timestamps: true });
readingHistorySchema.index({ userId: 1, date: 1 }, { unique: true });
export const ReadingHistory = model("ReadingHistory", readingHistorySchema);

/* NOTIFICATION */
const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["new_chapter","new_volume","series_update","review_reply","system","recommendation"], default: "system" },
  title: { type: String, required: true },
  body: String,
  isRead: { type: Boolean, default: false },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", default: null },
  seriesId: { type: Schema.Types.ObjectId, ref: "Series", default: null },
  chapterId: { type: Schema.Types.ObjectId, ref: "Chapter", default: null },
  meta: { type: Schema.Types.Mixed },
}, { timestamps: true });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
export const Notification = model("Notification", notificationSchema);

/* DISCOUNT */
const discountSchema = new Schema({
  code: { type: String, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["percentage","fixed"] },
  value: Number,
  expiryDate: Date,
  usageLimit: Number,
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  description: String,
}, { timestamps: true });
export const Discount = model("Discount", discountSchema);

/* ACTIVITY LOG */
const activitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  meta: { type: Schema.Types.Mixed },
}, { timestamps: true });
activitySchema.index({ createdAt: -1 });
export const ActivityLog = model("ActivityLog", activitySchema);
