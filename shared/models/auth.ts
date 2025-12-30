import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const generateId = () => randomBytes(16).toString("hex");

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(generateId),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  profileImageUrl: text("profile_image_url"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const allowedEmails = sqliteTable("allowed_emails", {
  id: text("id").primaryKey().$defaultFn(generateId),
  email: text("email").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
