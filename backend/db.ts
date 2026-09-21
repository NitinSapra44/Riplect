import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from "@shared/schema";

/**
 * Database Connection Configuration
 *
 * IMPORTANT: This application uses Supabase PostgreSQL as the primary database.
 *
 * Environment-based database selection:
 * - PRODUCTION (NODE_ENV=production): Uses SUPABASE_DATABASE_URL
 * - DEVELOPMENT (NODE_ENV=development): Uses SUPABASE_DATABASE_URL (for now)
 *
 * NOTE: The Replit execute_sql_tool uses a SEPARATE Replit PostgreSQL database
 * (via DATABASE_URL, PGHOST, etc.) which is NOT connected to this application.
 * Do NOT confuse the two databases:
 * - Supabase = Production data, used by the app
 * - Replit PostgreSQL = Local tool database only, NOT used by the app
 *
 * To add database columns, use Supabase SQL Editor directly, NOT execute_sql_tool.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

// Always prefer Supabase database URL for the application
// DATABASE_URL from Replit PostgreSQL is NOT used by the app
const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This is the Supabase production database connection string. " +
    "NOTE: DATABASE_URL from Replit is a SEPARATE database not used by this application.",
  );
}

if (isDevelopment) {
  console.log("[Database] Development mode - connecting to Supabase database");
  console.log("[Database] WARNING: Development currently uses production Supabase database");
  console.log("[Database] For schema changes, use Supabase SQL Editor, NOT Replit execute_sql_tool");
}

const client = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: 'require',
});

export const db = drizzle({ client, schema });
