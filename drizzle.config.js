import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (e.g. sqlite:./data/crossword.sqlite)");
}

const drizzleUrl = databaseUrl.startsWith("sqlite:")
  ? databaseUrl.replace(/^sqlite:/, "file:")
  : databaseUrl;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: drizzleUrl,
  },
});
