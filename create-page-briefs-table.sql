-- AI Profile — page_briefs table (additive, non-destructive).
-- Apply with `npm run db:push` (preferred, derives from shared/schema.ts) or run
-- this SQL directly against Supabase. Safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS page_briefs (
  id              serial PRIMARY KEY,
  profile_id      text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          varchar(12) NOT NULL DEFAULT 'draft', -- 'draft' | 'published'
  brief           jsonb NOT NULL,
  schema_version  integer NOT NULL DEFAULT 1,
  model           varchar(80),
  published_at    timestamptz,
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);

-- One draft + one published row per profile; also powers upsert ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS page_briefs_profile_status_idx
  ON page_briefs (profile_id, status);
