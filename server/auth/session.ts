import type { Express } from "express";
import session from "express-session";
import path from "path";
import fs from "fs";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function setupSession(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set before starting the server");
  }

  const databaseUrl = process.env.DATABASE_URL;
  const isPostgres = databaseUrl && (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"));

  let store;

  if (isPostgres) {
    // PostgreSQL session store
    const { default: connectPgSimple } = await import("connect-pg-simple");
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: databaseUrl,
    });
    const PGStore = connectPgSimple(session);
    store = new PGStore({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
    });
  } else {
    // SQLite session store for local development
    const { default: connectSqlite3 } = await import("connect-sqlite3");
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const sessionDir = path.join(dataDir, "sessions");
    fs.mkdirSync(sessionDir, { recursive: true });

    const SQLiteStore = connectSqlite3(session);
    store = new SQLiteStore({
      dir: sessionDir,
      db: "sessions.sqlite",
    });
  }

  const secureFlagInput = (process.env.SESSION_COOKIE_SECURE ?? "")
    .toLowerCase()
    .trim();
  const cookieSecureFlag = secureFlagInput === "true"
    ? true
    : secureFlagInput === "false"
      ? false
      : process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);
  app.use(
    session({
      secret: sessionSecret,
      store: store as any,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: cookieSecureFlag ? "strict" : "lax",
        secure: cookieSecureFlag,
        maxAge: ONE_WEEK_MS,
      },
    }),
  );
}
