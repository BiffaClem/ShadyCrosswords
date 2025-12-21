import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Import users from auth for relations
import { users } from "./models/auth";

// Puzzles table - stores puzzle data
export const puzzles = pgTable("puzzles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  puzzleId: varchar("puzzle_id").notNull().unique(),
  title: varchar("title").notNull(),
  data: jsonb("data").notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Puzzle sessions - represents a solving session (solo or collaborative)
export const puzzleSessions = pgTable("puzzle_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  puzzleId: varchar("puzzle_id").references(() => puzzles.id).notNull(),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  name: varchar("name"),
  isCollaborative: boolean("is_collaborative").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Session participants - who can access a session
export const sessionParticipants = pgTable("session_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => puzzleSessions.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_session_user").on(table.sessionId, table.userId)
]);

// Puzzle progress - stores the current state of a session
export const puzzleProgress = pgTable("puzzle_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => puzzleSessions.id).notNull().unique(),
  grid: jsonb("grid").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
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

// Insert schemas
export const insertPuzzleSchema = createInsertSchema(puzzles).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(puzzleSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertParticipantSchema = createInsertSchema(sessionParticipants).omit({ id: true, joinedAt: true });
export const insertProgressSchema = createInsertSchema(puzzleProgress).omit({ id: true, updatedAt: true });

// Types
export type Puzzle = typeof puzzles.$inferSelect;
export type InsertPuzzle = z.infer<typeof insertPuzzleSchema>;
export type PuzzleSession = typeof puzzleSessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type PuzzleProgress = typeof puzzleProgress.$inferSelect;
export type InsertProgress = z.infer<typeof insertProgressSchema>;
