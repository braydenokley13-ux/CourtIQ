import { describe, expect, it } from 'vitest'
import { buildScene } from './scene'
import { KNOWN_CONCEPT_PRESETS } from './presets'
import { COURT } from './coords'

describe('buildScene', () => {
  it('synthesises from court_state when no scene/concept matches', () => {
    const result = buildScene({
      id: 'fake',
      court_state: {
        offense: [
          { id: 'you', x: 250, y: 200, role: 'wing', hasBall: true },
          { id: 'o2', x: 100, y: 100, role: 'pg' },
          { id: 'o3', x: 400, y: 100, role: 'sf' },
          { id: 'o4', x: 200, y: 350, role: 'pf' },
          { id: 'o5', x: 300, y: 350, role: 'c' },
        ],
        defense: [
          { id: 'd1', x: 250, y: 220, role: 'on_ball' },
          { id: 'd2', x: 110, y: 120, role: 'd' },
          { id: 'd3', x: 390, y: 120, role: 'd' },
          { id: 'd4', x: 210, y: 340, role: 'd' },
          { id: 'd5', x: 290, y: 340, role: 'd' },
        ],
        ball_location: { x: 250, y: 200 },
      },
    })
    expect(result.synthetic).toBe(true)
    expect(result.players).toHaveLength(10)
    expect(result.players.find((p) => p.id === 'you')?.isUser).toBe(true)
  })

  it('returns the matching preset for a known concept tag', () => {
    const result = buildScene({
      id: 'closeouts_demo',
      concept_tags: ['closeouts'],
      court_state: { offense: [], defense: [], ball_location: { x: 0, y: 0 } },
    })
    expect(result.synthetic).toBe(false)
    expect(result.type).toBe('closeouts')
    expect(result.players.some((p) => p.isUser)).toBe(true)
  })

  it('exposes presets for each launch concept', () => {
    expect(KNOWN_CONCEPT_PRESETS).toEqual(
      expect.arrayContaining([
        'closeouts',
        'cutting_relocation',
        'help_defense_basics',
        'low_man_rotation',
        'spacing_fundamentals',
        'transition_stop_ball',
      ]),
    )
  })

  it('uses an authored scene when present', () => {
    const result = buildScene({
      id: 'authored',
      concept_tags: ['closeouts'],
      court_state: { offense: [], defense: [], ball_location: { x: 0, y: 0 } },
      scene: {
        type: 'authored_test',
        players: [
          { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
      },
    })
    expect(result.type).toBe('authored_test')
    expect(result.players).toHaveLength(1)
  })

  it('falls back to preset when authored scene is invalid', () => {
    const result = buildScene({
      id: 'authored_bad',
      concept_tags: ['spacing_fundamentals'],
      court_state: { offense: [], defense: [], ball_location: { x: 0, y: 0 } },
      // missing required `players` field
      scene: { ball: { start: { x: 0, z: 0 } } },
    })
    expect(result.type).toBe('spacing_fundamentals')
  })

  it('returns a default scene when source has nothing usable', () => {
    const result = buildScene({ id: 'empty' })
    expect(result.id).toBe('empty')
    expect(result.players.length).toBeGreaterThanOrEqual(2)
    expect(result.players.some((p) => p.isUser && p.label === 'You')).toBe(true)
    expect(result.players.some((p) => p.team === 'defense')).toBe(true)
    expect(result.ball.holderId).toBe('you')
  })

  it('returns a default scene when concept is unknown and court_state is missing', () => {
    const result = buildScene({ id: 'mystery', concept_tags: ['unknown_concept'] })
    expect(result.players.some((p) => p.label === 'You')).toBe(true)
    expect(result.players.some((p) => p.team === 'defense')).toBe(true)
  })

  it('returns a visible default scene when authored scene is invalid and no preset matches', () => {
    const result = buildScene({
      id: 'invalid_default',
      scene: {
        players: 'not an array',
        ball: null,
      },
    })
    expect(result.synthetic).toBe(true)
    expect(result.players.some((p) => p.label === 'You')).toBe(true)
    expect(result.players.some((p) => p.team === 'defense')).toBe(true)
    expect(Number.isFinite(result.ball.start.x)).toBe(true)
    expect(Number.isFinite(result.ball.start.z)).toBe(true)
  })

  it('clamps NaN/Infinity coordinates to a safe position on the half-court', () => {
    const result = buildScene({
      id: 'nan',
      scene: {
        players: [
          {
            id: 'user',
            team: 'offense',
            role: 'wing',
            start: { x: Number.NaN, z: Number.POSITIVE_INFINITY },
            isUser: true,
          },
        ],
        ball: { start: { x: Number.NaN, z: Number.NaN } },
      },
    })
    const player = result.players[0]!
    expect(Number.isFinite(player.start.x)).toBe(true)
    expect(Number.isFinite(player.start.z)).toBe(true)
    expect(player.start.x).toBeGreaterThanOrEqual(-COURT.halfWidthFt)
    expect(player.start.x).toBeLessThanOrEqual(COURT.halfWidthFt)
    expect(player.start.z).toBeGreaterThanOrEqual(0)
    expect(player.start.z).toBeLessThanOrEqual(COURT.halfLengthFt)
    expect(Number.isFinite(result.ball.start.x)).toBe(true)
    expect(Number.isFinite(result.ball.start.z)).toBe(true)
  })

  it('drops movements that point at unknown players', () => {
    const result = buildScene({
      id: 'orphan_moves',
      concept_tags: ['closeouts'],
    })
    // closeouts preset is valid; manually fabricate a scene with an orphan
    const fabricated = buildScene({
      id: 'orphan_moves2',
      scene: {
        players: [
          { id: 'a', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
        // movement schema requires the playerId to match a player or "ball";
        // the schema rejects this, so buildScene falls through to default.
        movements: [{ id: 'm', playerId: 'ghost', kind: 'cut', to: { x: 0, z: 0 } }],
      },
    })
    expect(result.movements.every((m) => m.playerId === 'ball' || result.players.find((p) => p.id === m.playerId))).toBe(true)
    expect(fabricated.movements.every((m) => m.playerId === 'ball' || fabricated.players.find((p) => p.id === m.playerId))).toBe(true)
  })

  it('keeps at most one isUser player even if input flags many', () => {
    const result = buildScene({
      id: 'multiuser',
      court_state: {
        offense: [
          { id: 'you', x: 250, y: 200, role: 'wing' },
          { id: 'them', x: 100, y: 100, role: 'wing' },
        ],
        defense: [],
        ball_location: { x: 250, y: 200 },
      },
      user_role: 'wing',
    })
    expect(result.players.filter((p) => p.isUser)).toHaveLength(1)
  })

  it('every preset normalises to a valid scene with players and ball', () => {
    for (const tag of KNOWN_CONCEPT_PRESETS) {
      const result = buildScene({ id: `s_${tag}`, concept_tags: [tag] })
      expect(result.players.length).toBeGreaterThan(0)
      expect(Number.isFinite(result.ball.start.x)).toBe(true)
      expect(Number.isFinite(result.ball.start.z)).toBe(true)
      expect(result.players.filter((p) => p.isUser).length).toBeLessThanOrEqual(1)
    }
  })

  it('default and synth scenes have no freeze marker', () => {
    expect(buildScene({ id: 'empty' }).freezeAtMs).toBeNull()
    expect(buildScene({ id: 'preset', concept_tags: ['closeouts'] }).freezeAtMs).toBeNull()
  })

  it('resolves freezeMarker.atMs to freezeAtMs on scene load', () => {
    const result = buildScene({
      id: 'freeze_at_ms',
      scene: {
        players: [
          { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
        freezeMarker: { kind: 'atMs', atMs: 1234 },
      },
    })
    expect(result.freezeAtMs).toBe(1234)
  })

  it('resolves freezeMarker.beforeMovementId via the movement timeline', () => {
    const result = buildScene({
      id: 'freeze_before_movement',
      scene: {
        players: [
          { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
        movements: [
          { id: 'first', playerId: 'user', kind: 'cut', to: { x: 0, z: 8 }, durationMs: 700 },
          {
            id: 'second',
            playerId: 'user',
            kind: 'back_cut',
            to: { x: 0, z: 4 },
            durationMs: 500,
            delayMs: 100,
          },
        ],
        freezeMarker: { kind: 'beforeMovementId', movementId: 'second' },
      },
    })
    // first movement starts at 0 and ends at 700; second starts at 800
    expect(result.freezeAtMs).toBe(800)
  })

  it('falls through to preset when authored freezeMarker references a missing movement id', () => {
    const result = buildScene({
      id: 'bad_freeze',
      concept_tags: ['closeouts'],
      scene: {
        players: [
          { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
        movements: [],
        freezeMarker: { kind: 'beforeMovementId', movementId: 'missing' },
      },
    })
    // Schema rejects the authored scene; buildScene falls back to the
    // preset rather than throwing.
    expect(result.type).toBe('closeouts')
  })
})

describe('buildScene — Pack 2 Teaching-Quality wire-in (decoderTag + effectiveDifficulty)', () => {
  const minimalAuthoredScene = {
    players: [
      { id: 'user', team: 'offense' as const, role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      { id: 'pg', team: 'offense' as const, role: 'ball_handler', start: { x: 0, z: 22 }, hasBall: true },
    ],
    ball: { start: { x: 0, z: 22 } },
  }

  it('propagates decoder_tag through to scene.decoderTag for known decoders', () => {
    const tags = [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
      'ADVANTAGE_OR_RESET',
      'READ_THE_COVERAGE',
      'HUNT_THE_ADVANTAGE',
    ] as const
    for (const tag of tags) {
      const result = buildScene({
        id: 'wire-in',
        scene: minimalAuthoredScene,
        decoder_tag: tag,
      })
      expect(result.decoderTag).toBe(tag)
    }
  })

  it('coerces unknown decoder strings to undefined (no throw)', () => {
    const result = buildScene({
      id: 'wire-in',
      scene: minimalAuthoredScene,
      decoder_tag: 'NOT_A_REAL_DECODER',
    })
    expect(result.decoderTag).toBeUndefined()
  })

  it('propagates difficulty through to scene.effectiveDifficulty', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const result = buildScene({
        id: 'wire-in',
        scene: minimalAuthoredScene,
        difficulty: d,
      })
      expect(result.effectiveDifficulty).toBe(d)
    }
  })

  it('drops out-of-band difficulty to undefined (downstream helpers fall back)', () => {
    for (const d of [0, 6, 99, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = buildScene({
        id: 'wire-in',
        scene: minimalAuthoredScene,
        difficulty: d,
      })
      expect(result.effectiveDifficulty).toBeUndefined()
    }
  })

  it('rounds non-integer difficulty to the nearest integer', () => {
    expect(
      buildScene({ id: 'x', scene: minimalAuthoredScene, difficulty: 4.4 }).effectiveDifficulty,
    ).toBe(4)
    expect(
      buildScene({ id: 'x', scene: minimalAuthoredScene, difficulty: 4.6 }).effectiveDifficulty,
    ).toBe(5)
  })

  it('preserves both fields through the preset fall-through path', () => {
    const result = buildScene({
      id: 'wire-in-preset',
      concept_tags: ['closeouts'],
      decoder_tag: 'ADVANTAGE_OR_RESET',
      difficulty: 4,
    })
    expect(result.decoderTag).toBe('ADVANTAGE_OR_RESET')
    expect(result.effectiveDifficulty).toBe(4)
  })

  it('preserves both fields through the synth-from-court-state path', () => {
    const result = buildScene({
      id: 'wire-in-synth',
      court_state: {
        offense: [{ id: 'user', x: 0, y: 0, role: 'wing' }],
        defense: [],
        ball_location: { x: 0, y: 0 },
      },
      decoder_tag: 'BACKDOOR_WINDOW',
      difficulty: 2,
    })
    expect(result.decoderTag).toBe('BACKDOOR_WINDOW')
    expect(result.effectiveDifficulty).toBe(2)
  })

  it('legacy scenes (no decoder_tag, no difficulty) leave both fields undefined', () => {
    const result = buildScene({
      id: 'legacy',
      scene: minimalAuthoredScene,
    })
    expect(result.decoderTag).toBeUndefined()
    expect(result.effectiveDifficulty).toBeUndefined()
  })
})

describe('buildScene — Pack 2 Teaching-Quality F11 (acceptableDemos)', () => {
  it('defaults acceptableDemos to empty array on every scene path', () => {
    // Authored scene path
    const authored = buildScene({
      id: 'a',
      scene: {
        players: [
          { id: 'user', team: 'offense' as const, role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        ],
        ball: { start: { x: 0, z: 10 } },
      },
    })
    expect(authored.acceptableDemos).toEqual([])

    // Synth-from-court-state path
    const synth = buildScene({
      id: 'b',
      court_state: {
        offense: [{ id: 'user', x: 0, y: 0, role: 'wing' }],
        defense: [],
        ball_location: { x: 0, y: 0 },
      },
    })
    expect(synth.acceptableDemos).toEqual([])

    // Default scene path (no inputs)
    const fallback = buildScene({ id: 'c' })
    expect(fallback.acceptableDemos).toEqual([])
  })

  it('propagates an authored acceptableDemos block onto Scene3D.acceptableDemos', () => {
    const result = buildScene({
      id: 'a',
      scene: {
        players: [
          { id: 'user', team: 'offense' as const, role: 'wing', start: { x: 0, z: 10 }, isUser: true },
          { id: 'pg', team: 'offense' as const, role: 'ball_handler', start: { x: 0, z: 22 }, hasBall: true },
        ],
        ball: { start: { x: 0, z: 22 } },
        movements: [],
        wrongDemos: [
          {
            choiceId: 'c3',
            movements: [{ id: 'm1', playerId: 'user', kind: 'cut', to: { x: 5, z: 5 } }],
            caption: 'wrong path',
          },
        ],
        acceptableDemos: [
          {
            choiceId: 'c2',
            movements: [{ id: 'm2', playerId: 'user', kind: 'cut', to: { x: 8, z: 8 } }],
            caption: 'second-best read',
          },
        ],
      },
    })
    expect(result.acceptableDemos).toHaveLength(1)
    expect(result.acceptableDemos[0]!.choiceId).toBe('c2')
    expect(result.acceptableDemos[0]!.caption).toBe('second-best read')
    expect(result.acceptableDemos[0]!.movements).toHaveLength(1)
    expect(result.wrongDemos).toHaveLength(1)
    expect(result.wrongDemos[0]!.choiceId).toBe('c3')
  })
})
