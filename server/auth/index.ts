import type { Express } from "express";
import passport from "passport";
import { setupSession } from "./session";
import { setupPassport } from "./localStrategy";
import { ensureDefaultAdmin } from "./seedDefaultAdmin";
import { sql } from "drizzle-orm";
import { db } from "../db";

export async function setupAuth(app: Express) {
  // Ensure database schema exists before running migrations
  try {
    console.log("Ensuring database schema exists...");
    // Create tables if they don't exist
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS allowed_emails (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        first_name TEXT,
        invited_by TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS puzzles (
        id TEXT PRIMARY KEY,
        puzzle_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        uploaded_by TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        puzzle_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_collaborative INTEGER NOT NULL DEFAULT 0,
        difficulty TEXT NOT NULL DEFAULT 'standard',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS session_participants (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        last_activity INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(session_id, user_id)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS session_progress (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        grid TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        submitted_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (updated_by) REFERENCES users(id)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS session_invites (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        invited_user_id TEXT NOT NULL,
        invited_by_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (invited_user_id) REFERENCES users(id),
        FOREIGN KEY (invited_by_id) REFERENCES users(id)
      )
    `);
    console.log("Database schema ready");
  } catch (error) {
    console.error("Failed to create database schema:", error);
    // Don't crash the app, but log the error
  }

  setupSession(app);
  setupPassport();
  app.use(passport.initialize());
  app.use(passport.session());
  await ensureDefaultAdmin();
}

export { registerAuthRoutes } from "./routes";
export { isAuthenticated, requireAdmin } from "./guards";
export { authStorage } from "./storage";
