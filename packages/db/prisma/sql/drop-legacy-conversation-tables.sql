-- Launch cleanup: drop legacy chat tables that were never part of the
-- Prisma schema. `prisma db push` cannot drop `conversation_members`
-- on its own because other objects (foreign keys / views) depend on
-- it; CASCADE removes those dependents so the subsequent `db push`
-- can reconcile the database with the schema.
--
-- IF EXISTS keeps this idempotent — once the tables are gone the
-- statements are harmless no-ops on every later deploy.
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_members CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
