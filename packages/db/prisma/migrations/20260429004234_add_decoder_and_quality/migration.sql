-- Phase C — additive decoder taxonomy + choice quality + mastery dimension.
-- Forward-only migration. All changes are non-breaking for existing reads:
-- legacy `is_correct` is preserved on ScenarioChoice; `quality` is back-filled
-- so every row is non-null after the migration runs. Mastery rows gain a
-- `dimension` column with default `'concept'`, so existing PK lookups
-- (now keyed on the 3-tuple) still resolve to the same row.

-- CreateEnum
CREATE TYPE "DecoderTag" AS ENUM ('BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT', 'SKIP_THE_ROTATION', 'ADVANTAGE_OR_RESET');

-- CreateEnum
CREATE TYPE "ChoiceQuality" AS ENUM ('best', 'acceptable', 'wrong');

-- CreateEnum
CREATE TYPE "MasteryDimension" AS ENUM ('concept', 'decoder');

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "decoder_tag" "DecoderTag";

-- AlterTable
-- New column lands with default 'wrong' so existing rows get a non-null
-- value immediately, then the back-fill below promotes the previously
-- correct row to 'best'. After the back-fill, the column is the source of
-- truth; legacy `is_correct` stays in place so older code keeps working.
ALTER TABLE "ScenarioChoice" ADD COLUMN "quality" "ChoiceQuality" NOT NULL DEFAULT 'wrong';

UPDATE "ScenarioChoice" SET "quality" = 'best' WHERE "is_correct" = TRUE;

-- AlterTable
-- Mastery PK widens to (user_id, concept_id, dimension). Existing rows
-- pick up dimension='concept' via the column default; the new PK reads
-- identically for concept-mastery callers because every legacy row now
-- carries dimension='concept'.
ALTER TABLE "Mastery" DROP CONSTRAINT "Mastery_pkey";

ALTER TABLE "Mastery" ADD COLUMN "dimension" "MasteryDimension" NOT NULL DEFAULT 'concept';

ALTER TABLE "Mastery" ADD CONSTRAINT "Mastery_pkey" PRIMARY KEY ("user_id", "concept_id", "dimension");
