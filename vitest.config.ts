import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["frontend/**/*.test.ts", "backend/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
    // Dummy env so backend/db.ts and other env-throwing modules can be imported
    // during tests. The tests don't touch the DB — schema tests just parse
    // Zod, date tests are pure.
    env: {
      SUPABASE_DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SUPABASE_URL: "http://test.supabase",
      SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
