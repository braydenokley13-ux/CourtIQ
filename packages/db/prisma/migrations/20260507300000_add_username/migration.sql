-- Add username (visible login identifier) and recovery_email (optional, for password reset)
-- to the User table. The email column continues to store the synthetic Supabase auth email
-- (username@users.courtiq.app) and is not shown to users.

ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "recovery_email" TEXT;

-- Back-fill existing rows so the NOT NULL + UNIQUE constraints below can be satisfied.
-- Derives a stable username from the left side of the existing email plus a short
-- disambiguating suffix from the row's UUID.
UPDATE "User"
  SET "username" = LOWER(SPLIT_PART("email", '@', 1)) || '_' || SUBSTR(MD5("id"), 1, 6)
  WHERE "username" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
