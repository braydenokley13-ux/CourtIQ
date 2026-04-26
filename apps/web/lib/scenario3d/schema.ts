import { z } from 'zod'

const courtPointSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
})

const scenePlayerSchema = z.object({
  id: z.string().min(1),
  team: z.enum(['offense', 'defense']),
  role: z.string().min(1),
  label: z.string().min(1).max(8).optional(),
  start: courtPointSchema,
  isUser: z.boolean().optional(),
  hasBall: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'color must be a hex like #3BE383')
    .optional(),
})

const sceneBallSchema = z.object({
  start: courtPointSchema,
  holderId: z.string().min(1).optional(),
})

const movementKindSchema = z.enum([
  'cut',
  'closeout',
  'rotation',
  'lift',
  'drift',
  'pass',
  'drive',
  'stop_ball',
])

const sceneMovementSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  kind: movementKindSchema,
  to: courtPointSchema,
  delayMs: z.number().int().nonnegative().max(10_000).optional(),
  durationMs: z.number().int().positive().max(8_000).optional(),
  caption: z.string().max(80).optional(),
})

export const sceneSchema = z
  .object({
    type: z.string().min(1).max(48).optional(),
    court: z.enum(['half', 'full']).default('half'),
    camera: z.enum(['teaching_angle', 'defense', 'top_down']).default('teaching_angle'),
    players: z.array(scenePlayerSchema).min(1).max(10),
    ball: sceneBallSchema,
    movements: z.array(sceneMovementSchema).max(32).default([]),
    answerDemo: z.array(sceneMovementSchema).max(32).default([]),
  })
  .superRefine((scene, ctx) => {
    const userPlayers = scene.players.filter((p) => p.isUser)
    if (userPlayers.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['players'],
        message: `At most one player may be marked isUser; found ${userPlayers.length}.`,
      })
    }

    const ids = new Set<string>()
    for (const p of scene.players) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['players'],
          message: `Duplicate player id "${p.id}".`,
        })
      }
      ids.add(p.id)
    }

    if (scene.ball.holderId && !ids.has(scene.ball.holderId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ball', 'holderId'],
        message: `holderId "${scene.ball.holderId}" does not match any player id.`,
      })
    }

    const validMovementTargets = new Set([...ids, 'ball'])
    for (const list of [scene.movements, scene.answerDemo]) {
      for (const m of list) {
        if (!validMovementTargets.has(m.playerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['movements'],
            message: `movement "${m.id}" references unknown playerId "${m.playerId}".`,
          })
        }
      }
    }
  })

export type SceneInput = z.infer<typeof sceneSchema>
