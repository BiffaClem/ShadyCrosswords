import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const isPostgres = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: {
    url: isPostgres ? databaseUrl : databaseUrl.replace(/^sqlite:/, "file:"),
  },
});
