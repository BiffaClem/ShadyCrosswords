import { randomBytes } from "crypto";
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

const generateId = () => randomBytes(16).toString("hex");

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(generateId),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  profileImageUrl: text("profile_image_url"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  emailVerified: integer("email_verified").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const allowedEmails = pgTable("allowed_emails", {
  id: text("id").primaryKey().$defaultFn(generateId),
  email: text("email").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
