import { randomBytes } from "crypto";
import { sql, relations } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Import users from auth for relations
import { users } from "./models/auth";

const jsonText = <T extends string>(name: T) => text(name, { mode: "json" });
const generateId = () => randomBytes(16).toString("hex");

// Puzzles table - stores puzzle data
export const puzzles = sqliteTable("puzzles", {
  id: text("id").primaryKey().$defaultFn(generateId),
  puzzleId: text("puzzle_id").notNull().unique(),
  title: text("title").notNull(),
  data: jsonText("data").notNull(),
  uploadedBy: text("uploaded_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Puzzle sessions - represents a solving session (solo or collaborative)
export const puzzleSessions = sqliteTable("puzzle_sessions", {
  id: text("id").primaryKey().$defaultFn(generateId),
  puzzleId: text("puzzle_id").references(() => puzzles.id).notNull(),
  ownerId: text("owner_id").references(() => users.id).notNull(),
  name: text("name"),
  isCollaborative: integer("is_collaborative", { mode: "boolean" }).default(false),
  difficulty: text("difficulty").default("standard"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Session participants - who can access a session
export const sessionParticipants = sqliteTable("session_participants", {
  id: text("id").primaryKey().$defaultFn(generateId),
  sessionId: text("session_id").references(() => puzzleSessions.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  lastActivity: integer("last_activity", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// Puzzle progress - stores the current state of a session
export const puzzleProgress = sqliteTable("puzzle_progress", {
  id: text("id").primaryKey().$defaultFn(generateId),
  sessionId: text("session_id").references(() => puzzleSessions.id).notNull().unique(),
  grid: jsonText("grid").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").references(() => users.id),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
});

// Session invites - tracks pending invitations to sessions
export const sessionInvites = sqliteTable("session_invites", {
  id: text("id").primaryKey().$defaultFn(generateId),
  sessionId: text("session_id").references(() => puzzleSessions.id).notNull(),
  invitedUserId: text("invited_user_id").references(() => users.id).notNull(),
  invitedById: text("invited_by_id").references(() => users.id).notNull(),
  status: text("status").default("pending").notNull(), // pending, accepted, declined
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  respondedAt: integer("responded_at", { mode: "timestamp" }),
});

// Relations
export const puzzlesRelations = relations(puzzles, ({ one, many }) => ({
  uploader: one(users, {
    fields: [puzzles.uploadedBy],
    references: [users.id],
  }),
  sessions: many(puzzleSessions),
}));

export const puzzleSessionsRelations = relations(puzzleSessions, ({ one, many }) => ({
  puzzle: one(puzzles, {
    fields: [puzzleSessions.puzzleId],
    references: [puzzles.id],
  }),
  owner: one(users, {
    fields: [puzzleSessions.ownerId],
    references: [users.id],
  }),
  participants: many(sessionParticipants),
  progress: one(puzzleProgress, {
    fields: [puzzleSessions.id],
    references: [puzzleProgress.sessionId],
  }),
}));

export const sessionParticipantsRelations = relations(sessionParticipants, ({ one }) => ({
  session: one(puzzleSessions, {
    fields: [sessionParticipants.sessionId],
    references: [puzzleSessions.id],
  }),
  user: one(users, {
    fields: [sessionParticipants.userId],
    references: [users.id],
  }),
}));

export const puzzleProgressRelations = relations(puzzleProgress, ({ one }) => ({
  session: one(puzzleSessions, {
    fields: [puzzleProgress.sessionId],
    references: [puzzleSessions.id],
  }),
  updater: one(users, {
    fields: [puzzleProgress.updatedBy],
    references: [users.id],
  }),
}));

export const sessionInvitesRelations = relations(sessionInvites, ({ one }) => ({
  session: one(puzzleSessions, {
    fields: [sessionInvites.sessionId],
    references: [puzzleSessions.id],
  }),
  invitedUser: one(users, {
    fields: [sessionInvites.invitedUserId],
    references: [users.id],
  }),
  invitedBy: one(users, {
    fields: [sessionInvites.invitedById],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertPuzzleSchema = createInsertSchema(puzzles).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(puzzleSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertParticipantSchema = createInsertSchema(sessionParticipants).omit({ id: true, joinedAt: true, lastActivity: true });
export const insertProgressSchema = createInsertSchema(puzzleProgress).omit({ id: true, updatedAt: true });
export const insertInviteSchema = createInsertSchema(sessionInvites).omit({ id: true, createdAt: true, respondedAt: true });

// Types
export type Puzzle = typeof puzzles.$inferSelect;
export type InsertPuzzle = z.infer<typeof insertPuzzleSchema>;
export type PuzzleSession = typeof puzzleSessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type PuzzleProgress = typeof puzzleProgress.$inferSelect;
export type InsertProgress = z.infer<typeof insertProgressSchema>;
export type SessionInvite = typeof sessionInvites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
