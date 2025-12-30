import { db } from "../db";
import { allowedEmails, users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function migrateAllowedEmailsToUsers() {
  console.log("Starting migration: ensuring all allowed emails have user records...");

  // Get all allowed emails
  const allAllowedEmails = await db.select().from(allowedEmails);

  let createdCount = 0;
  let skippedCount = 0;

  for (const allowed of allAllowedEmails) {
    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, allowed.email)).limit(1);

    if (existingUser.length === 0) {
      // Create user record
      const passwordHash = await bcrypt.hash("Shady0ks", 12);
      await db.insert(users).values({
        email: allowed.email,
        passwordHash,
        firstName: null, // Will be updated by admin later
        role: "user",
        createdAt: allowed.createdAt || new Date(),
        updatedAt: new Date(),
      });
      createdCount++;
      console.log(`Created user record for: ${allowed.email}`);
    } else {
      skippedCount++;
    }
  }

  console.log(`Migration complete: ${createdCount} user records created, ${skippedCount} already existed`);
}

migrateAllowedEmailsToUsers()
  .then(() => {
    console.log("Migration successful");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });