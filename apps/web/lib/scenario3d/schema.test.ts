import { describe, expect, it } from 'vitest'
import {
  choiceQualitySchema,
  coachValidationSchema,
  decoderTagSchema,
  freezeMarkerSchema,
  isAllowedPreAnswerOverlay,
  overlayPrimitiveSchema,
  resolveFreezeAtMs,
  sceneSchema,
} from './schema'

const baseScene = {
  type: 'demo',
  players: [
    {
      id: 'user',
      team: 'offense' as const,
      role: 'wing',
      label: 'You',
      start: { x: -18, z: 8 },
      isUser: true,
    },
    {
      id: 'pg',
      team: 'offense' as const,
      role: 'ball_handler',
      start: { x: 0, z: 22 },
      hasBall: true,
    },
  ],
  ball: { start: { x: 0, z: 22 }, holderId: 'pg' },
  movements: [
    { id: 'cut', playerId: 'user', kind: 'cut' as const, to: { x: 0, z: 4 } },
  ],
  answerDemo: [
    { id: 'pass', playerId: 'ball', kind: 'pass' as const, to: { x: 0, z: 4 } },
  ],
}

describe('sceneSchema', () => {
  it('accepts a well-formed scene', () => {
    const result = sceneSchema.safeParse(baseScene)
    expect(result.success).toBe(true)
  })

  it('rejects two players marked isUser', () => {
    const bad = {
      ...baseScene,
      players: baseScene.players.map((p) => ({ ...p, isUser: true })),
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects duplicate player ids', () => {
    const bad = {
      ...baseScene,
      players: [baseScene.players[0]!, { ...baseScene.players[1]!, id: 'user' }],
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects movement targets that do not exist', () => {
    const bad = {
      ...baseScene,
      movements: [{ id: 'x', playerId: 'ghost', kind: 'cut' as const, to: { x: 0, z: 0 } }],
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('accepts "ball" as a movement target even though no player has that id', () => {
    const ok = {
      ...baseScene,
      movements: [{ id: 'pass', playerId: 'ball', kind: 'pass' as const, to: { x: 0, z: 4 } }],
    }
    const result = sceneSchema.safeParse(ok)
    expect(result.success).toBe(true)
  })

  it('rejects ball.holderId that does not match a player', () => {
    const bad = { ...baseScene, ball: { ...baseScene.ball, holderId: 'mystery' } }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('applies defaults for court and camera', () => {
    const minimal = {
      players: [{ id: 'a', team: 'offense', role: 'r', start: { x: 0, z: 0 } }],
      ball: { start: { x: 0, z: 0 } },
    }
    const result = sceneSchema.parse(minimal)
    expect(result.court).toBe('half')
    expect(result.camera).toBe('teaching_angle')
  })

  it('accepts the new movement kinds', () => {
    for (const kind of ['back_cut', 'baseline_sneak', 'skip_pass', 'rip', 'jab'] as const) {
      const result = sceneSchema.safeParse({
        ...baseScene,
        movements: [{ id: 'm', playerId: 'user', kind, to: { x: 0, z: 4 } }],
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts the new passer_side_three_quarter camera preset', () => {
    const result = sceneSchema.safeParse({ ...baseScene, camera: 'passer_side_three_quarter' })
    expect(result.success).toBe(true)
  })

  it('accepts a freezeMarker with kind=atMs', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      freezeMarker: { kind: 'atMs', atMs: 1200 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a freezeMarker with kind=beforeMovementId that references a real movement', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      freezeMarker: { kind: 'beforeMovementId', movementId: 'cut' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a freezeMarker referencing an unknown movement id', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      freezeMarker: { kind: 'beforeMovementId', movementId: 'ghost' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts wrongDemos referencing a real player', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      wrongDemos: [
        {
          choiceId: 'choice_a',
          movements: [{ id: 'wd1', playerId: 'user', kind: 'rip', to: { x: 1, z: 4 } }],
          caption: 'Wrong demo',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects wrongDemos with movements pointing at unknown players', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      wrongDemos: [
        {
          choiceId: 'choice_a',
          movements: [{ id: 'wd1', playerId: 'ghost', kind: 'cut', to: { x: 1, z: 4 } }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('parses each overlay primitive kind', () => {
    const referencingPg = (kind: string, extras: Record<string, unknown> = {}) => ({
      ...baseScene,
      postAnswerOverlays: [{ kind, playerId: 'pg', ...extras }],
    })
    const cases: Array<unknown> = [
      referencingPg('defender_vision_cone'),
      referencingPg('defender_hip_arrow'),
      referencingPg('defender_foot_arrow'),
      referencingPg('defender_chest_line'),
      referencingPg('defender_hand_in_lane'),
      referencingPg('help_pulse', { role: 'tag' }),
      {
        ...baseScene,
        postAnswerOverlays: [
          { kind: 'passing_lane_open', from: 'pg', to: 'user' },
          { kind: 'passing_lane_blocked', from: 'pg', to: 'user' },
        ],
      },
      {
        ...baseScene,
        postAnswerOverlays: [
          { kind: 'open_space_region', anchor: { x: 0, z: 4 } },
          { kind: 'label', anchor: { x: 0, z: 4 }, text: 'open' },
          { kind: 'timing_pulse', anchor: { x: 0, z: 4 }, durationMs: 500 },
          {
            kind: 'drive_cut_preview',
            playerId: 'user',
            path: [{ x: 0, z: 10 }, { x: 0, z: 4 }],
          },
        ],
      },
    ]
    for (const candidate of cases) {
      expect(sceneSchema.safeParse(candidate).success).toBe(true)
    }
  })

  it('rejects pre-answer overlays that reveal the answer (passing_lane_open)', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      preAnswerOverlays: [{ kind: 'passing_lane_open', from: 'pg', to: 'user' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts pre-answer overlays from the allow-list', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      preAnswerOverlays: [
        { kind: 'defender_vision_cone', playerId: 'pg' },
        { kind: 'label', anchor: { x: 0, z: 4 }, text: 'cue' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects overlays that reference an unknown player', () => {
    const result = sceneSchema.safeParse({
      ...baseScene,
      postAnswerOverlays: [{ kind: 'defender_hip_arrow', playerId: 'ghost' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('decoderTagSchema', () => {
  it('accepts the four launch tags', () => {
    for (const tag of [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
      'ADVANTAGE_OR_RESET',
    ] as const) {
      expect(decoderTagSchema.safeParse(tag).success).toBe(true)
    }
  })

  it('rejects unknown decoder tags', () => {
    expect(decoderTagSchema.safeParse('FAKE_DECODER').success).toBe(false)
  })
})

describe('choiceQualitySchema', () => {
  it('accepts best/acceptable/wrong', () => {
    for (const v of ['best', 'acceptable', 'wrong'] as const) {
      expect(choiceQualitySchema.safeParse(v).success).toBe(true)
    }
  })
  it('rejects anything else', () => {
    expect(choiceQualitySchema.safeParse('partial').success).toBe(false)
  })
})

describe('freezeMarkerSchema', () => {
  it('parses both forms', () => {
    expect(freezeMarkerSchema.safeParse({ kind: 'atMs', atMs: 0 }).success).toBe(true)
    expect(
      freezeMarkerSchema.safeParse({ kind: 'beforeMovementId', movementId: 'm1' }).success,
    ).toBe(true)
  })

  it('rejects negative atMs', () => {
    expect(freezeMarkerSchema.safeParse({ kind: 'atMs', atMs: -1 }).success).toBe(false)
  })
})

describe('overlayPrimitiveSchema', () => {
  it('rejects unknown kinds', () => {
    expect(
      overlayPrimitiveSchema.safeParse({ kind: 'mystery', playerId: 'a' }).success,
    ).toBe(false)
  })

  it('isAllowedPreAnswerOverlay agrees with the schema-level rule', () => {
    expect(isAllowedPreAnswerOverlay('label')).toBe(true)
    expect(isAllowedPreAnswerOverlay('passing_lane_open')).toBe(false)
    expect(isAllowedPreAnswerOverlay('drive_cut_preview')).toBe(false)
  })
})

describe('coachValidationSchema', () => {
  it('rejects level=high + status=not_needed', () => {
    expect(
      coachValidationSchema.safeParse({ level: 'high', status: 'not_needed' }).success,
    ).toBe(false)
  })
  it('accepts level=low + status=not_needed', () => {
    expect(
      coachValidationSchema.safeParse({ level: 'low', status: 'not_needed' }).success,
    ).toBe(true)
  })
})

describe('resolveFreezeAtMs', () => {
  it('returns null for a missing marker', () => {
    expect(resolveFreezeAtMs(undefined, [])).toBeNull()
  })
  it('returns the absolute ms for kind=atMs', () => {
    expect(resolveFreezeAtMs({ kind: 'atMs', atMs: 1500 }, [])).toBe(1500)
  })
  it('looks up the start ms by movement id', () => {
    const lookup = [
      { id: 'first', startMs: 0 },
      { id: 'second', startMs: 800 },
    ]
    expect(
      resolveFreezeAtMs({ kind: 'beforeMovementId', movementId: 'second' }, lookup),
    ).toBe(800)
  })
  it('returns null when the movement id is unknown', () => {
    expect(
      resolveFreezeAtMs({ kind: 'beforeMovementId', movementId: 'ghost' }, []),
    ).toBeNull()
  })
})
