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
    expect(result.players.length).toBeGreaterThan(0)
    expect(result.players[0]!.isUser).toBe(true)
  })

  it('returns a default scene when concept is unknown and court_state is missing', () => {
    const result = buildScene({ id: 'mystery', concept_tags: ['unknown_concept'] })
    expect(result.players.length).toBeGreaterThan(0)
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
})
