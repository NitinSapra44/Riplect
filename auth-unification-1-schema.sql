-- ============================================================
-- Auth Unification — Task #150 (Identity Foundation)
-- ============================================================
-- Adds the canonical phone column on profiles plus the two
-- helper tables used by the new identity-linking endpoints.
--
-- Apply additively to Supabase. Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Canonical phone column on profiles ───────────────────
-- Single source of truth for "which profile owns this phone".
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_e164 varchar(20);

-- Unique only when set (allows many NULLs, one row per phone).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_e164_unique
  ON profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- ── 2. Phone OTP verification ledger ────────────────────────
-- Server-issued 6-digit codes for attaching a phone to an
-- already-signed-in auth.users row. NOT used for login.
-- user_id is the auth.users UUID (text). We deliberately do not
-- declare a FK to profiles(id) because a phone-first user may
-- not have a profiles row yet during onboarding.
CREATE TABLE IF NOT EXISTS phone_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text         NOT NULL,
  phone_e164    varchar(20)  NOT NULL,
  code_hash     text         NOT NULL,
  attempts      integer      NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  expires_at    timestamptz  NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_verif_user_created
  ON phone_verifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_verif_phone_created
  ON phone_verifications (phone_e164, created_at DESC);

-- ── 3. Email completion verification ledger ─────────────────
-- One-time signed-link tokens for the phone-first → email path
-- (email-and-set-password swap). The full token is stored as a
-- SHA-256 hash; the plaintext only lives in the user's email.
CREATE TABLE IF NOT EXISTS email_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text         NOT NULL,
  email         varchar      NOT NULL,
  token_hash    text         NOT NULL UNIQUE,
  next_step     varchar(40),
  consumed_at   timestamptz,
  expires_at    timestamptz  NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verif_user_created
  ON email_verifications (user_id, created_at DESC);
