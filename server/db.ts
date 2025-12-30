import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set (e.g. sqlite:./data/crossword.sqlite)");
}

function resolveSqlitePath(url: string): string {
  if (url.startsWith("sqlite:")) {
    const filePath = url.replace(/^sqlite:/, "");
    return path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
  }
  if (url.startsWith("file:")) {
    return path.isAbsolute(url)
      ? url.replace(/^file:/, "")
      : path.join(process.cwd(), url.replace(/^file:/, ""));
  }
  return path.isAbsolute(url) ? url : path.join(process.cwd(), url);
}

const sqlitePath = resolveSqlitePath(databaseUrl);
fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

const sqlite = new Database(sqlitePath);
export const db = drizzle(sqlite, { schema });
