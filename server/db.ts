import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

const normalizedTarget = (process.env.DB_TARGET ?? "").toLowerCase();

const prioritizedUrls = [
  normalizedTarget === "railway" ? process.env.RAILWAY_DATABASE_URL : undefined,
  normalizedTarget === "docker" ? process.env.DOCKER_DATABASE_URL : undefined,
  normalizedTarget === "local" ? process.env.LOCAL_DATABASE_URL : undefined,
  process.env.RAILWAY_DATABASE_URL,
  process.env.DOCKER_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.LOCAL_DATABASE_URL,
];

const databaseUrl = prioritizedUrls.find(
  (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
);

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not configured. Provide LOCAL/DOCKER/RAILWAY connection strings or set DB_TARGET accordingly.",
  );
}

const client = postgres(databaseUrl);
const db = drizzle(client, { schema });

export { db, databaseUrl };
