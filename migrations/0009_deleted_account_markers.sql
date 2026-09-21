-- Task #163: Explicit "previously deleted account" signal
--
-- Adds the `deleted_account_markers` breadcrumb table consulted by
-- GET /api/dashboard/profile to distinguish a *previously-deleted*
-- account (banner shown in onboarding) from a brand-new signup that
-- simply hasn't completed onboarding yet (no banner).
--
-- The row is written by DELETE /api/dashboard/delete-account *before*
-- the auth.users row is removed, and is cleared by POST
-- /api/dashboard/profile after the user successfully creates a fresh
-- profile. The table intentionally has NO foreign key to profiles or
-- auth.users — it must survive both the auth.users → profiles cascade
-- and any subsequent re-signup that mints a new auth uuid for the same
-- email.
--
-- Applied to Supabase: May 2026 (Task #163)

CREATE TABLE IF NOT EXISTS public.deleted_account_markers (
  email text PRIMARY KEY,
  original_user_id text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_account_markers_user_id_idx
  ON public.deleted_account_markers (original_user_id);
