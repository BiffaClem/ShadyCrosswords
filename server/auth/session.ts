import type { Express } from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import path from "path";
import fs from "fs";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function setupSession(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set before starting the server");
  }

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const sessionDir = path.join(dataDir, "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const SQLiteStore = connectSqlite3(session);
  const store = new SQLiteStore({
    dir: sessionDir,
    db: "sessions.sqlite",
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
