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
  // Existing kinds — present in legacy presets and existing seed JSON.
  'cut',
  'closeout',
  'rotation',
  'lift',
  'drift',
  'pass',
  'drive',
  'stop_ball',
  // Phase B additions — Section 4.4 of the decoder-foundations plan.
  // Behaviour is unchanged at this phase; the renderer treats unknown
  // kinds the same as their nearest existing analogue (Phase E wires
  // their bespoke visuals).
  'back_cut',
  'baseline_sneak',
  'skip_pass',
  'rip',
  'jab',
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

// --- Decoder taxonomy (Section 4.1) --------------------------------------
export const decoderTagSchema = z.enum([
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
])
export type DecoderTag = z.infer<typeof decoderTagSchema>

// --- Choice quality (Section 4.2) ----------------------------------------
export const choiceQualitySchema = z.enum(['best', 'acceptable', 'wrong'])
export type ChoiceQuality = z.infer<typeof choiceQualitySchema>

// --- Freeze marker (Section 4.4) -----------------------------------------
// Two authoring forms; both resolve to a single `freezeAtMs` at scene load
// (see `apps/web/lib/scenario3d/scene.ts`). `beforeMovementId` references
// a movement id that must exist in `scene.movements` — enforced in the
// scene-level superRefine below.
export const freezeMarkerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('atMs'),
    atMs: z.number().int().nonnegative().max(60_000),
  }),
  z.object({
    kind: z.literal('beforeMovementId'),
    movementId: z.string().min(1),
  }),
])
export type FreezeMarker = z.infer<typeof freezeMarkerSchema>

// --- Wrong-choice consequence demo (Section 4.4 / 5.5) -------------------
const wrongDemoSchema = z.object({
  choiceId: z.string().min(1),
  movements: z.array(sceneMovementSchema).max(32),
  caption: z.string().max(80).optional(),
})
export type WrongDemo = z.infer<typeof wrongDemoSchema>

// --- Overlay primitives (Section 4.5 / 6) --------------------------------
// Discriminated union so the seed validator and the renderer share
// exhaustive coverage. Pre-answer overlays are gated to a small allow-list
// (see PRE_ANSWER_OVERLAY_KINDS / `assertPreAnswerOverlayAllowlist`) so the
// pre-decision view never reveals the answer.
export const overlayPrimitiveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('passing_lane_open'),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    kind: z.literal('passing_lane_blocked'),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({
    kind: z.literal('defender_vision_cone'),
    playerId: z.string().min(1),
    targetId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('defender_hip_arrow'),
    playerId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('defender_foot_arrow'),
    playerId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('defender_chest_line'),
    playerId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('defender_hand_in_lane'),
    playerId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('open_space_region'),
    anchor: courtPointSchema,
    radiusFt: z.number().positive().max(20).default(4),
  }),
  z.object({
    kind: z.literal('help_pulse'),
    playerId: z.string().min(1),
    role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp']),
  }),
  z.object({
    kind: z.literal('drive_cut_preview'),
    playerId: z.string().min(1),
    path: z.array(courtPointSchema).min(2).max(8),
  }),
  z.object({
    kind: z.literal('label'),
    anchor: courtPointSchema,
    text: z.string().min(1).max(24),
  }),
  z.object({
    kind: z.literal('timing_pulse'),
    anchor: courtPointSchema,
    durationMs: z.number().int().positive().max(10_000),
  }),
])
export type OverlayPrimitive = z.infer<typeof overlayPrimitiveSchema>

// Authoring discipline: pre-answer overlays must not reveal the answer.
// Section 4.5: only these kinds are allowed pre-decision. Post-decision
// overlays may use any primitive.
export const PRE_ANSWER_OVERLAY_KINDS = [
  'defender_vision_cone',
  'defender_hip_arrow',
  'defender_foot_arrow',
  'defender_chest_line',
  'defender_hand_in_lane',
  'help_pulse',
  'label',
] as const

const PRE_ANSWER_OVERLAY_SET = new Set<string>(PRE_ANSWER_OVERLAY_KINDS)

export function isAllowedPreAnswerOverlay(kind: OverlayPrimitive['kind']): boolean {
  return PRE_ANSWER_OVERLAY_SET.has(kind)
}

// --- Coach validation (Section 4.6) --------------------------------------
export const coachValidationSchema = z
  .object({
    level: z.enum(['low', 'medium', 'high']),
    status: z.enum(['not_needed', 'needed', 'reviewed', 'approved']),
    notes: z.string().optional(),
    reviewerId: z.string().min(1).optional(),
    reviewedAt: z.string().datetime().optional(),
  })
  .superRefine((cv, ctx) => {
    if (cv.level === 'high' && cv.status === 'not_needed') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'level=high requires explicit review (not_needed is invalid).',
      })
    }
  })
export type CoachValidation = z.infer<typeof coachValidationSchema>

export const sceneSchema = z
  .object({
    type: z.string().min(1).max(48).optional(),
    court: z.enum(['half', 'full']).default('half'),
    camera: z
      .enum([
        'teaching_angle',
        'defense',
        'top_down',
        // Phase B addition. Behaviour for new presets is wired in
        // Phase E/G; the renderer falls back to teaching_angle until
        // then so existing scenes keep their framing.
        'passer_side_three_quarter',
      ])
      .default('teaching_angle'),
    players: z.array(scenePlayerSchema).min(1).max(10),
    ball: sceneBallSchema,
    movements: z.array(sceneMovementSchema).max(32).default([]),
    answerDemo: z.array(sceneMovementSchema).max(32).default([]),
    // Phase B additive fields. All optional / defaulted so legacy
    // fixtures parse unchanged.
    freezeMarker: freezeMarkerSchema.optional(),
    wrongDemos: z.array(wrongDemoSchema).max(8).default([]),
    preAnswerOverlays: z.array(overlayPrimitiveSchema).max(16).default([]),
    postAnswerOverlays: z.array(overlayPrimitiveSchema).max(16).default([]),
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
    const movementIds = new Set<string>()
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
    for (const m of scene.movements) {
      movementIds.add(m.id)
    }

    // wrongDemos[].movements use the same player set as the rest of the
    // scene. choiceId referential integrity is checked at the scenario
    // level (in scripts/seed-scenarios.ts) where the choice list lives.
    for (let i = 0; i < scene.wrongDemos.length; i++) {
      const demo = scene.wrongDemos[i]!
      for (const m of demo.movements) {
        if (!validMovementTargets.has(m.playerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wrongDemos', i, 'movements'],
            message: `wrongDemos[${i}].movement "${m.id}" references unknown playerId "${m.playerId}".`,
          })
        }
      }
    }

    if (scene.freezeMarker?.kind === 'beforeMovementId') {
      if (!movementIds.has(scene.freezeMarker.movementId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['freezeMarker', 'movementId'],
          message: `freezeMarker.movementId "${scene.freezeMarker.movementId}" does not match any scene.movements[*].id.`,
        })
      }
    }

    // Pre-answer overlay allow-list. Post-answer overlays may use any
    // primitive, so they're not gated here.
    for (let i = 0; i < scene.preAnswerOverlays.length; i++) {
      const ov = scene.preAnswerOverlays[i]!
      if (!isAllowedPreAnswerOverlay(ov.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preAnswerOverlays', i, 'kind'],
          message: `pre-answer overlay "${ov.kind}" is not in the allow-list (see PRE_ANSWER_OVERLAY_KINDS).`,
        })
      }
    }

    // Overlays that reference a player must reference a real one.
    const referencedPlayer = (kind: OverlayPrimitive['kind']) =>
      kind === 'defender_vision_cone' ||
      kind === 'defender_hip_arrow' ||
      kind === 'defender_foot_arrow' ||
      kind === 'defender_chest_line' ||
      kind === 'defender_hand_in_lane' ||
      kind === 'help_pulse' ||
      kind === 'drive_cut_preview'

    const checkOverlayRefs = (overlays: OverlayPrimitive[], path: 'preAnswerOverlays' | 'postAnswerOverlays') => {
      for (let i = 0; i < overlays.length; i++) {
        const ov = overlays[i]!
        if (referencedPlayer(ov.kind) && 'playerId' in ov && !ids.has(ov.playerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, i, 'playerId'],
            message: `${path}[${i}].playerId "${ov.playerId}" does not match any player id.`,
          })
        }
        if (ov.kind === 'passing_lane_open' || ov.kind === 'passing_lane_blocked') {
          if (!ids.has(ov.from)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path, i, 'from'],
              message: `${path}[${i}].from "${ov.from}" does not match any player id.`,
            })
          }
          if (!ids.has(ov.to)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path, i, 'to'],
              message: `${path}[${i}].to "${ov.to}" does not match any player id.`,
            })
          }
        }
        if (ov.kind === 'defender_vision_cone' && ov.targetId && !ids.has(ov.targetId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, i, 'targetId'],
            message: `${path}[${i}].targetId "${ov.targetId}" does not match any player id.`,
          })
        }
      }
    }
    checkOverlayRefs(scene.preAnswerOverlays, 'preAnswerOverlays')
    checkOverlayRefs(scene.postAnswerOverlays, 'postAnswerOverlays')
  })

export type SceneInput = z.infer<typeof sceneSchema>

/**
 * Resolves a `freezeMarker` to an absolute `freezeAtMs`. Returns null when:
 *   - the scene has no freeze marker (caller treats this as "freeze at end
 *     of movements[]", per Section 4.4)
 *   - `beforeMovementId` references a movement id that isn't in
 *     `movementsForLookup` (the schema rejects this at parse time, so this
 *     is a defensive fallback)
 *
 * `movementsForLookup` is the resolved timeline-style list of {id,
 * startMs} pairs. The caller (`scene.ts`) builds this off `buildTimeline`
 * so the two stay in sync.
 */
export function resolveFreezeAtMs(
  freezeMarker: FreezeMarker | undefined,
  movementsForLookup: ReadonlyArray<{ id: string; startMs: number }>,
): number | null {
  if (!freezeMarker) return null
  if (freezeMarker.kind === 'atMs') return freezeMarker.atMs
  const match = movementsForLookup.find((m) => m.id === freezeMarker.movementId)
  return match ? match.startMs : null
}
