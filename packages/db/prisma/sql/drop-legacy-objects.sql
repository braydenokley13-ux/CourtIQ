-- Launch cleanup: drop any object in the `public` schema that Prisma
-- does not manage, so `prisma db push` can reconcile the database
-- against the schema without tripping over leftover artifacts.
--
-- The production database carries objects from earlier Supabase
-- quickstarts (a chat tutorial: `conversations` / `messages`; an RBAC
-- tutorial: `app_role` / `user_roles`). `db push` aborts when it
-- tries to drop one of these and other objects still depend on it.
-- Dropping them up-front with CASCADE clears the dependents.
--
-- This runs on every deploy and is idempotent: once the legacy
-- objects are gone the loops below simply find nothing to drop.
--
-- The allow-lists below MUST stay in sync with the models and enums
-- in `schema.prisma`. Adding a model/enum there means adding its name
-- here, otherwise this script would drop the freshly created table.
DO $$
DECLARE
  obj record;
  prisma_tables text[] := ARRAY[
    'User', 'Profile', 'Concept', 'Module', 'Lesson', 'Scenario',
    'ScenarioChoice', 'SessionRun', 'Attempt', 'Mastery', 'Badge',
    'UserBadge', 'StreakEvent', 'LeaderboardEntry', 'BossChallengeAttempt',
    '_prisma_migrations'
  ];
  prisma_enums text[] := ARRAY[
    'Position', 'SkillLevel', 'UserRole', 'Category', 'ScenarioStatus',
    'BadgeFamily', 'DecoderTag', 'ChoiceQuality', 'MasteryDimension',
    'SessionMode'
  ];
BEGIN
  FOR obj IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND NOT (tablename = ANY (prisma_tables))
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', obj.tablename);
  END LOOP;

  FOR obj IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND NOT (t.typname = ANY (prisma_enums))
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', obj.typname);
  END LOOP;
END $$;
