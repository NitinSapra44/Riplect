-- AI-generated landing-page websites (PROTOTYPE feature).
-- Safe, additive migration: creates ONE new table. Does not touch any
-- existing table or data. Run this instead of `drizzle-kit push`.
--
-- How to run: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.

CREATE TABLE IF NOT EXISTS generated_sites (
  id            serial PRIMARY KEY,
  profile_id    text NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  html          text NOT NULL,
  model         varchar(80),
  style_hint    text,
  status        varchar(12) NOT NULL DEFAULT 'draft',
  input_tokens  integer,
  output_tokens integer,
  generated_at  timestamptz DEFAULT now(),
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);
