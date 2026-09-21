-- Default new creator profiles to Asia/Kolkata (IST) instead of America/New_York.
-- Additive, non-destructive: only changes the column DEFAULT for future inserts;
-- does not touch any existing row's value.
ALTER TABLE "profiles" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';
