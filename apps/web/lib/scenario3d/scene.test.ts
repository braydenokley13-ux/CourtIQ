import { describe, expect, it } from 'vitest'
import { buildScene } from './scene'
import { KNOWN_CONCEPT_PRESETS } from './presets'

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
})
