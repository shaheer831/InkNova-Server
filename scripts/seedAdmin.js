/**
 * scripts/seedAdmin.js
 * Seeds the SuperAdmin role and the first superadmin user.
 *
 * Run with: node scripts/seedAdmin.js
 *
 * SuperAdmin is identified by SUPER_ADMIN_EMAIL in .env.
 * This user can NEVER be deleted or deactivated via the API.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { User, Role } from "../models/index.js";
import { VALID_PERMISSIONS } from "../config/permissions.js";

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("❌  SUPER_ADMIN_EMAIL is not set in .env");
    process.exit(1);
  }

  // ── 1. Upsert the SuperAdmin role with all permissions ──
  let superAdminRole = await Role.findOne({ name: "SuperAdmin" });
  if (!superAdminRole) {
    superAdminRole = await Role.create({
      name: "SuperAdmin",
      permissions: VALID_PERMISSIONS,
      isSystem: true,
    });
    console.log("✅  SuperAdmin role created");
  } else {
    // Keep the role's permissions in sync with VALID_PERMISSIONS
    superAdminRole.permissions = VALID_PERMISSIONS;
    await superAdminRole.save();
    console.log("✅  SuperAdmin role updated with latest permissions");
  }

  // ── 2. Check if superadmin user already exists ──
  const existing = await User.findOne({ email: adminEmail.toLowerCase() });
  if (existing) {
    // Keep roleId and direct permissions in sync on every re-run
    existing.roleId = superAdminRole._id;
    existing.permissions = VALID_PERMISSIONS;
    await existing.save();
    console.log("✅  SuperAdmin user synced (roleId + permissions up to date):", existing.email);
    process.exit(0);
  }

  // ── 3. Create the superadmin user ──
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "Admin@123456";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await User.create({
    name: "Super Admin",
    email: adminEmail.toLowerCase(),
    passwordHash,
    roleId: superAdminRole._id,
    permissions: VALID_PERMISSIONS,
    isActive: true,
  });

  console.log(`✅  SuperAdmin user created: ${adminEmail}`);
  console.log("⚠️   Change the password immediately after first login!");
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});