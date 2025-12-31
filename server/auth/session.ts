import type { Express } from "express";
import session from "express-session";
import { databaseUrl } from "../db";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function setupSession(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set before starting the server");
  }

  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    throw new Error("Session store requires a PostgreSQL DATABASE_URL");
  }

  const connectPgSimple = (await import("connect-pg-simple")).default;
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
  });
  const PGStore = connectPgSimple(session);
  const store = new PGStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  });

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
