import { defineConfig } from "drizzle-kit";

// Use Supabase database URL if available, otherwise fall back to DATABASE_URL
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL must be set, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
