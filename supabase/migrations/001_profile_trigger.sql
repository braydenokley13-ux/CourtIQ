-- Supabase Database Trigger: auto-create User + Profile on auth.users insert.
-- Apply via: supabase db push  (or paste into the SQL editor in the Supabase dashboard)
--
-- NOTE: Prisma generates PascalCase table names.  After running `prisma migrate dev`
-- the tables exist as "User" and "Profile" in the public schema.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert into public."User"
  INSERT INTO public."User" (id, email, created_at)
  VALUES (
    NEW.id::text,
    NEW.email,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Upsert into public."Profile" with the required defaults (PRODUCT_SPEC §7.3)
  INSERT INTO public."Profile" (
    user_id,
    iq_score,
    xp_total,
    level,
    current_streak,
    longest_streak,
    streak_freeze_count,
    updated_at
  )
  VALUES (
    NEW.id::text,
    500,   -- default IQ (calibration will update this)
    0,
    1,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop if it already exists so this migration is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
