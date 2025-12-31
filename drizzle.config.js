import { defineConfig } from "drizzle-kit";

const normalizedTarget = (process.env.DB_TARGET ?? "").toLowerCase();

const selectUrl = (...urls) => urls.find((value) => typeof value === "string" && value.length > 0);

const databaseUrl = selectUrl(
  normalizedTarget === "railway" ? process.env.RAILWAY_DATABASE_URL : undefined,
  normalizedTarget === "docker" ? process.env.DOCKER_DATABASE_URL : undefined,
  normalizedTarget === "local" ? process.env.LOCAL_DATABASE_URL : undefined,
  process.env.RAILWAY_DATABASE_URL,
  process.env.DOCKER_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.LOCAL_DATABASE_URL,
);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure LOCAL/DOCKER/RAILWAY URLs or set DB_TARGET.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
