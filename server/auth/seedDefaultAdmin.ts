import bcrypt from "bcryptjs";
import { authStorage } from "./storage";

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? "mark.clement@outlook.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ?? "shadyx1970!";
const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME ?? "Mark";

export async function ensureDefaultAdmin() {
  // First, run migration to ensure all allowed emails have user records
  await migrateAllowedEmailsToUsers();

  if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_PASSWORD) {
    return;
  }

  await authStorage.ensureAllowedEmail(DEFAULT_ADMIN_EMAIL, null);
  const existing = await authStorage.getUserByEmail(DEFAULT_ADMIN_EMAIL);
  if (existing) {
    let needsUpdate = false;
    const updateData: { role?: string; passwordHash?: string; firstName?: string | null } = {};

    if (existing.role !== "admin") {
      updateData.role = "admin";
      needsUpdate = true;
    }

    if (DEFAULT_ADMIN_NAME && existing.firstName !== DEFAULT_ADMIN_NAME) {
      updateData.firstName = DEFAULT_ADMIN_NAME;
      needsUpdate = true;
    }

    const passwordMatches = existing.passwordHash
      ? await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, existing.passwordHash)
      : false;

    if (!passwordMatches) {
      updateData.passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
      needsUpdate = true;
    }

    if (needsUpdate) {
      await authStorage.updateUser(existing.id, updateData as any);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  await authStorage.createUser({
    email: DEFAULT_ADMIN_EMAIL,
    passwordHash,
    firstName: DEFAULT_ADMIN_NAME,
    role: "admin",
  });
}

async function migrateAllowedEmailsToUsers() {
  console.log("Starting migration: ensuring all allowed emails have user records...");

  try {
    // Get all allowed emails
    const allAllowedEmails = await authStorage.listAllowedEmails();

    let createdCount = 0;
    let skippedCount = 0;

    for (const allowed of allAllowedEmails) {
      // Check if user already exists
      const existingUser = await authStorage.getUserByEmail(allowed.email);

      if (!existingUser) {
        // Create user record
        const passwordHash = await bcrypt.hash("Shady0ks", 12);
        await authStorage.createUser({
          email: allowed.email,
          passwordHash,
          firstName: null, // Will be updated by admin later
          role: "user",
        });
        createdCount++;
        console.log(`Created user record for: ${allowed.email}`);
      } else {
        skippedCount++;
      }
    }

    console.log(`Migration complete: ${createdCount} user records created, ${skippedCount} already existed`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
}
