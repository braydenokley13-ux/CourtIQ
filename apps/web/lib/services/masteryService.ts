import { type DecoderTag, type Prisma, MasteryDimension } from '@prisma/client'
import { mastery } from '@courtiq/core'

/**
 * Updates Mastery rows for an attempt.
 *
 * Phase C makes Mastery a single-table discriminated record: one row per
 * `(user_id, concept_id, dimension)`. Concept-dimension rows behave
 * identically to the pre-C semantics. When a scenario carries a
 * `decoder_tag`, an additional decoder-dimension row is written so the
 * Academy / home-screen surfaces can later query decoder mastery in the
 * same shape as concept mastery — same accuracy curve, same cooldown.
 *
 * The decoder row's `concept_id` is the decoder-tag string itself
 * (`BACKDOOR_WINDOW`, `EMPTY_SPACE_CUT`, ...). `dimension` disambiguates
 * the namespace, so a concept slug and a decoder tag never collide on
 * the PK.
 */
export async function update(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    conceptIds: string[]
    isCorrect: boolean
    /** Optional decoder tag from the scenario (Phase C). When set, a
     *  decoder-dimension Mastery row is upserted alongside the concept
     *  rows. */
    decoderTag?: DecoderTag | null
  },
): Promise<void> {
  const now = new Date()
  const dueAt = input.isCorrect ? null : new Date(now.getTime() + 24 * 60 * 60 * 1000)

  for (const conceptId of input.conceptIds) {
    await upsertOne(tx, {
      userId: input.userId,
      conceptId,
      dimension: MasteryDimension.concept,
      isCorrect: input.isCorrect,
      now,
      dueAt,
    })
  }

  if (input.decoderTag) {
    await upsertOne(tx, {
      userId: input.userId,
      conceptId: input.decoderTag,
      dimension: MasteryDimension.decoder,
      isCorrect: input.isCorrect,
      now,
      dueAt,
    })
  }
}

async function upsertOne(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    conceptId: string
    dimension: MasteryDimension
    isCorrect: boolean
    now: Date
    dueAt: Date | null
  },
): Promise<void> {
  const current = await tx.mastery.findUnique({
    where: {
      user_id_concept_id_dimension: {
        user_id: input.userId,
        concept_id: input.conceptId,
        dimension: input.dimension,
      },
    },
  })

  const next = mastery.update(
    { attempts: current?.attempts_count ?? 0, accuracy: current?.rolling_accuracy ?? 0 },
    input.isCorrect,
  )

  await tx.mastery.upsert({
    where: {
      user_id_concept_id_dimension: {
        user_id: input.userId,
        concept_id: input.conceptId,
        dimension: input.dimension,
      },
    },
    create: {
      user_id: input.userId,
      concept_id: input.conceptId,
      dimension: input.dimension,
      attempts_count: next.attempts,
      rolling_accuracy: next.accuracy,
      last_seen_at: input.now,
      spaced_rep_due_at: input.dueAt,
    },
    update: {
      attempts_count: next.attempts,
      rolling_accuracy: next.accuracy,
      last_seen_at: input.now,
      spaced_rep_due_at: input.dueAt,
    },
  })
}
