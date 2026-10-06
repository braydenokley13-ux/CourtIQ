import { z } from 'zod'
import type { LabConfig } from './types'
const playerIds = ['O1', 'O2', 'O3', 'O4', 'O5', 'D1', 'D2', 'D3', 'D4', 'D5'] as const
const finite = (min: number, max: number) => z.number().finite().min(min).max(max)
const pointSchema = z.object({ x: finite(-7.3, 7.3), z: finite(0.4, 14) }).strict()
const movementTargetSchema = z.object({ x: finite(-7.25, 7.25), z: finite(0.4, 14) }).strict()
const coachRuleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('roller-depth'),
      depth: finite(2.5, 7),
      response: z.enum(['low-man-tags', 'big-recovers']),
    })
    .strict(),
  z
    .object({ kind: z.literal('lift-rise'), rise: finite(0.5, 3), response: z.enum(['stay-with-lift', 'x-out']) })
    .strict(),
])
const teamAnswerSchema = z
  .object({
    coverage: z.enum(['drop', 'switch', 'blitz', 'hedge', 'ice', 'custom']),
    poa: z.enum(['over', 'under']),
    bigDepth: finite(1.5, 6),
    tag: z.boolean(),
    tagDepth: finite(0, 1),
    backside: z.enum(['x-out', 'stay']),
    rotationTiming: z.enum(['early', 'on-pass']),
    recovery: z.enum(['on-pass', 'roller-secured']),
    coachRules: z
      .array(coachRuleSchema)
      .max(2)
      .refine(
        (rules) => new Set(rules.map((rule) => rule.kind)).size === rules.length,
        'Use one response for each coaching observation.',
      )
      .optional(),
  })
  .strict()
const assumptionsSchema = z
  .object({
    dt: finite(0.01, 0.05),
    duration: finite(2, 12),
    maxSpeed: finite(1, 8),
    acceleration: finite(1, 15),
    reactionDelay: finite(0, 0.8),
    passSpeed: finite(5, 20),
    ballRadius: finite(0.06, 0.2),
    bodyRadius: finite(0.18, 0.45),
    contestRadius: finite(0.5, 2),
    turnRate: finite(1, 10),
    gatherTime: finite(0.12, 0.6),
    readInterval: finite(0.05, 0.5),
    gravity: finite(8, 11),
    releaseHeight: finite(1.2, 2.4),
  })
  .strict()
  .refine((a) => a.duration / a.dt <= 3000, 'The replay exceeds the supported frame budget.')
const opponentStrategySchema = z
  .object({
    screenAngle: finite(-0.65, 0.65),
    liftDelay: finite(-0.25, 0.6),
    liftWidth: finite(-0.7, 0.7),
    reject: z.boolean(),
    rescreen: z.boolean(),
    shortRoll: z.boolean(),
  })
  .strict()
/** Per-player athletic overrides (multipliers; height in metres). Absent = engine default from height. */
const personnelSchema = z.record(
  z.enum(playerIds),
  z
    .object({
      speed: finite(0.6, 1.4).optional(),
      lateral: finite(0.4, 1.1).optional(),
      height: finite(1.5, 2.3).optional(),
    })
    .strict(),
)
const interventionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1).max(120),
      at: finite(0, 12),
      kind: z.literal('answer'),
      patch: teamAnswerSchema
        .partial()
        .refine((p) => Object.keys(p).length > 0, 'An adjustment needs at least one rule.'),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      at: finite(0, 12),
      kind: z.literal('opponent'),
      patch: opponentStrategySchema
        .partial()
        .refine((p) => Object.keys(p).length > 0, 'An opponent adjustment needs at least one rule.'),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      at: finite(0, 12),
      kind: z.literal('move'),
      playerId: z.enum(playerIds),
      target: movementTargetSchema,
      until: finite(0, 12).optional(),
      untilTrigger: z.enum(['ball-leaves', 'big-secured']).optional(),
    })
    .strict(),
])

export const labConfigSchema: z.ZodType<LabConfig> = z
  .object({
    problemId: z.string().min(1).max(160),
    seed: z.number().int().min(0).max(0xffffffff),
    counter: z.enum(['auto', 'roll', 'reject', 'pop', 'slip', 'lift', 'skip', 'extra', 'short-roll']),
    answer: teamAnswerSchema,
    assumptions: assumptionsSchema,
    interventions: z.array(interventionSchema).max(64),
    startingPositions: z.record(z.enum(playerIds), pointSchema).optional(),
    screenAngle: finite(-Math.PI, Math.PI).optional(),
    opponent: opponentStrategySchema.optional(),
    personnel: personnelSchema.optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set<string>()
    let previous = -Infinity
    config.interventions.forEach((intervention, index) => {
      if (intervention.at < previous || intervention.at > config.assumptions.duration) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Adjustments must be chronological and inside the replay.',
          path: ['interventions', index, 'at'],
        })
      }
      if (ids.has(intervention.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Adjustment IDs must be unique.',
          path: ['interventions', index, 'id'],
        })
      if (
        intervention.kind === 'move' &&
        intervention.until !== undefined &&
        (intervention.until <= intervention.at || intervention.until > config.assumptions.duration)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Movement end must follow its start and remain inside the replay.',
          path: ['interventions', index, 'until'],
        })
      }
      ids.add(intervention.id)
      previous = intervention.at
    })
  })

export function parseLabConfig(input: unknown): LabConfig {
  return labConfigSchema.parse(input)
}
