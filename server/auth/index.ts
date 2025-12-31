import type { Express } from "express";
import passport from "passport";
import { setupSession } from "./session";
import { setupPassport } from "./localStrategy";
import { ensureDefaultAdmin } from "./seedDefaultAdmin";
import { sql } from "drizzle-orm";
import { db } from "../db";
import postgres from "postgres";

export async function setupAuth(app: Express) {
  // Ensure database schema exists before running migrations
  try {
    console.log("Ensuring database schema exists...");
    const databaseUrl = process.env.DATABASE_URL;
    const isPostgres = databaseUrl && (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"));

    if (isPostgres) {
      // Use postgres client directly for schema creation
      const sql = postgres(databaseUrl);
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          first_name TEXT,
          profile_image_url TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          email_verified INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS allowed_emails (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          invited_by TEXT REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS puzzles (
          id TEXT PRIMARY KEY,
          puzzle_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          data JSONB NOT NULL,
          uploaded_by TEXT REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS puzzle_sessions (
          id TEXT PRIMARY KEY,
          puzzle_id TEXT NOT NULL REFERENCES puzzles(id),
          owner_id TEXT NOT NULL REFERENCES users(id),
          name TEXT,
          is_collaborative INTEGER DEFAULT 0,
          difficulty TEXT DEFAULT 'standard',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS session_participants (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES puzzle_sessions(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(session_id, user_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS puzzle_progress (
          id TEXT PRIMARY KEY,
          session_id TEXT UNIQUE NOT NULL REFERENCES puzzle_sessions(id),
          grid JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_by TEXT REFERENCES users(id),
          submitted_at TIMESTAMP WITH TIME ZONE
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS session_invites (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES puzzle_sessions(id),
          invited_user_id TEXT NOT NULL REFERENCES users(id),
          invited_by_id TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          responded_at TIMESTAMP WITH TIME ZONE
        )
      `;
      await sql.end();
    } else {
      // SQLite fallback - use drizzle
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          first_name TEXT,
          profile_image_url TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          email_verified INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS allowed_emails (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          invited_by TEXT REFERENCES users(id),
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS puzzles (
          id TEXT PRIMARY KEY,
          puzzle_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          data TEXT NOT NULL,
          uploaded_by TEXT REFERENCES users(id),
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS puzzle_sessions (
          id TEXT PRIMARY KEY,
          puzzle_id TEXT NOT NULL REFERENCES puzzles(id),
          owner_id TEXT NOT NULL REFERENCES users(id),
          name TEXT,
          is_collaborative INTEGER DEFAULT 0,
          difficulty TEXT DEFAULT 'standard',
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS session_participants (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES puzzle_sessions(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          joined_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          last_activity INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          UNIQUE(session_id, user_id)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS puzzle_progress (
          id TEXT PRIMARY KEY,
          session_id TEXT UNIQUE NOT NULL REFERENCES puzzle_sessions(id),
          grid TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          updated_by TEXT REFERENCES users(id),
          submitted_at INTEGER
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS session_invites (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES puzzle_sessions(id),
          invited_user_id TEXT NOT NULL REFERENCES users(id),
          invited_by_id TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          responded_at INTEGER
        )
      `);
    }
    console.log("Database schema ready");
  } catch (error) {
    console.error("Failed to create database schema:", error);
    // Don't crash the app, but log the error
  }

  await setupSession(app);
  setupPassport();
  app.use(passport.initialize());
  app.use(passport.session());
  await ensureDefaultAdmin();
}

export { registerAuthRoutes } from "./routes";
export { isAuthenticated, requireAdmin } from "./guards";
export { authStorage } from "./storage";
