import { z } from 'zod'
import type { LabConfig } from '../types'

/** Frozen v1 formats. These never use installed content or the current engine version. */
const n = (min: number, max: number) => z.number().finite().min(min).max(max)
const players = ['O1', 'O2', 'O3', 'O4', 'O5', 'D1', 'D2', 'D3', 'D4', 'D5'] as const
const answer = z
  .object({
    coverage: z.enum(['drop', 'switch', 'blitz', 'hedge', 'ice', 'custom']),
    poa: z.enum(['over', 'under']),
    bigDepth: n(1.5, 6),
    tag: z.boolean(),
    tagDepth: n(0, 1),
    backside: z.enum(['x-out', 'stay']),
    rotationTiming: z.enum(['early', 'on-pass']),
    recovery: z.enum(['on-pass', 'roller-secured']),
    coachRules: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('roller-depth'),
              depth: n(2.5, 7),
              response: z.enum(['low-man-tags', 'big-recovers']),
            })
            .strict(),
          z
            .object({ kind: z.literal('lift-rise'), rise: n(0.5, 3), response: z.enum(['stay-with-lift', 'x-out']) })
            .strict(),
        ]),
      )
      .max(2)
      .refine((v) => new Set(v.map((r) => r.kind)).size === v.length)
      .optional(),
  })
  .strict()
const opponent = z
  .object({
    screenAngle: n(-0.65, 0.65),
    liftDelay: n(-0.25, 0.6),
    liftWidth: n(-0.7, 0.7),
    reject: z.boolean(),
    rescreen: z.boolean(),
    shortRoll: z.boolean(),
  })
  .strict()
const intervention = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1).max(120),
      at: n(0, 12),
      kind: z.literal('answer'),
      patch: answer.partial().refine((v) => Object.keys(v).length > 0),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      at: n(0, 12),
      kind: z.literal('opponent'),
      patch: opponent.partial().refine((v) => Object.keys(v).length > 0),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      at: n(0, 12),
      kind: z.literal('move'),
      playerId: z.enum(players),
      target: z.object({ x: n(-7.25, 7.25), z: n(0.4, 14) }).strict(),
      until: n(0, 12).optional(),
      untilTrigger: z.enum(['ball-leaves', 'big-secured']).optional(),
    })
    .strict(),
])
export const legacyRecipeSchema = z
  .object({
    problemId: z.literal('high-pnr-weakside-lift'),
    seed: z.number().int().min(0).max(0xffffffff),
    counter: z.enum(['auto', 'roll', 'reject', 'pop', 'slip', 'lift', 'skip', 'extra', 'short-roll']),
    answer,
    assumptions: z
      .object({
        dt: n(0.01, 0.05),
        duration: n(2, 12),
        maxSpeed: n(1, 8),
        acceleration: n(1, 15),
        reactionDelay: n(0, 0.8),
        passSpeed: n(5, 20),
        ballRadius: n(0.06, 0.2),
        bodyRadius: n(0.18, 0.45),
        contestRadius: n(0.5, 2),
        turnRate: n(1, 10),
        gatherTime: n(0.12, 0.6),
        readInterval: n(0.05, 0.5),
        gravity: n(8, 11),
        releaseHeight: n(1.2, 2.4),
      })
      .strict()
      .refine((v) => v.duration / v.dt <= 3000),
    interventions: z.array(intervention).max(64),
    startingPositions: z.record(z.enum(players), z.object({ x: n(-7.3, 7.3), z: n(0.4, 14) }).strict()).optional(),
    screenAngle: n(-Math.PI, Math.PI).optional(),
    opponent: opponent.optional(),
    personnel: z
      .record(
        z.enum(players),
        z
          .object({ speed: n(0.6, 1.4).optional(), lateral: n(0.4, 1.1).optional(), height: n(1.5, 2.3).optional() })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set<string>()
    let previous = -1
    for (const [index, cue] of config.interventions.entries()) {
      if (
        ids.has(cue.id) ||
        cue.at < previous ||
        cue.at > config.assumptions.duration ||
        (cue.kind === 'move' &&
          cue.until !== undefined &&
          (cue.until <= cue.at || cue.until > config.assumptions.duration))
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interventions', index],
          message: 'Legacy adjustments must have unique IDs and valid chronological times.',
        })
      ids.add(cue.id)
      previous = cue.at
    }
  })
export function parseLegacyRecipe(value: unknown): LabConfig {
  return legacyRecipeSchema.parse(value) as LabConfig
}
