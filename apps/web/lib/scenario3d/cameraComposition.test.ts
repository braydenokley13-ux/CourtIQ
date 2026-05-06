/**
 * V2-C — Camera composition emphasis tests.
 *
 * Locks:
 *  1. The user is always anchored first (when one exists).
 *  2. The ball-handler is anchored second when distinct from the user.
 *  3. SKR's key defender is the farthest defender from the user
 *     (over-helper); other decoders pick the closest defender.
 *  4. Empty / decoder-less scenes still return a non-empty id list
 *     when the scene has at least one player.
 *  5. computeFramingWeights returns one entry per scene player and
 *     never produces NaN weights.
 *  6. Pure: same input → byte-identical output.
 */

import { describe, it, expect } from 'vitest'
import {
  computeFramingWeights,
  pickEmphasisPlayerIds,
} from './cameraComposition'
import type { Scene3D } from './scene'
import type { DecoderTag } from './schema'
import type { ReplayPhase } from '@/components/scenario3d/ScenarioReplayController'

function fixtureScene(overrides: Partial<Scene3D> = {}): Scene3D {
  return {
    id: 'TEST-01',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      {
        id: 'you',
        team: 'offense',
        role: 'wing',
        label: 'You',
        start: { x: 12, z: 8 },
        isUser: true,
      },
      {
        id: 'pg',
        team: 'offense',
        role: 'ball_handler',
        label: 'PG',
        start: { x: 0, z: 22 },
        hasBall: true,
      },
      {
        id: 'd-near',
        team: 'defense',
        role: 'wing',
        label: 'X1',
        start: { x: 13, z: 7 },
      },
      {
        id: 'd-far',
        team: 'defense',
        role: 'help',
        label: 'X2',
        start: { x: -10, z: 14 },
      },
    ],
    ball: { holderId: 'pg', start: { x: 0, z: 22 } },
    movements: [],
    answerDemo: [],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    ...overrides,
  } as Scene3D
}

describe('pickEmphasisPlayerIds', () => {
  it('always anchors the user first when one exists', () => {
    const ids = pickEmphasisPlayerIds(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    expect(ids[0]).toBe('you')
  })

  it('anchors the ball-handler second when distinct from the user', () => {
    const ids = pickEmphasisPlayerIds(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    expect(ids).toContain('pg')
  })

  it('picks the closest defender for BDW/ESC/AOR', () => {
    const decoders: DecoderTag[] = [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
    ]
    for (const d of decoders) {
      const ids = pickEmphasisPlayerIds(fixtureScene(), d, 'frozen')
      expect(ids).toContain('d-near')
      expect(ids).not.toContain('d-far')
    }
  })

  it('picks the farthest defender for SKR (help-defense over-helper)', () => {
    const ids = pickEmphasisPlayerIds(
      fixtureScene(),
      'SKIP_THE_ROTATION',
      'frozen',
    )
    expect(ids).toContain('d-far')
    expect(ids).not.toContain('d-near')
  })

  it('skips the key-defender pick during non-freeze phases', () => {
    const phases: ReplayPhase[] = ['idle', 'setup', 'playing']
    for (const phase of phases) {
      const ids = pickEmphasisPlayerIds(fixtureScene(), 'BACKDOOR_WINDOW', phase)
      expect(ids).not.toContain('d-near')
    }
  })

  it('falls back to user + first non-user offense when decoder is null', () => {
    const ids = pickEmphasisPlayerIds(fixtureScene(), null, 'frozen')
    expect(ids[0]).toBe('you')
    // pg (ball handler) is offense, distinct from user.
    expect(ids).toContain('pg')
  })

  it('returns at least one id when the scene has any players', () => {
    const ids = pickEmphasisPlayerIds(
      fixtureScene({ ball: { start: { x: 0, z: 0 } } }),
      null,
      'idle',
    )
    expect(ids.length).toBeGreaterThan(0)
  })

  it('is pure — same input returns the same id list', () => {
    const a = pickEmphasisPlayerIds(fixtureScene(), 'BACKDOOR_WINDOW', 'frozen')
    const b = pickEmphasisPlayerIds(fixtureScene(), 'BACKDOOR_WINDOW', 'frozen')
    expect(a).toEqual(b)
  })
})

describe('computeFramingWeights', () => {
  it('returns one entry per scene player', () => {
    const weights = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    expect(weights).toHaveLength(4)
    const ids = weights.map((w) => w.playerId).sort()
    expect(ids).toEqual(['d-far', 'd-near', 'pg', 'you'])
  })

  it('user gets weight 1.0', () => {
    const weights = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    const user = weights.find((w) => w.role === 'user')!
    expect(user.weight).toBe(1)
  })

  it('key defender gets a high weight (>= 0.85)', () => {
    const weights = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    const keyDef = weights.find((w) => w.role === 'key-defender')!
    expect(keyDef.weight).toBeGreaterThanOrEqual(0.85)
  })

  it('produces only finite, non-negative weights', () => {
    const weights = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    for (const w of weights) {
      expect(Number.isFinite(w.weight)).toBe(true)
      expect(w.weight).toBeGreaterThanOrEqual(0)
    }
  })

  it('is pure — same input returns equal weight maps', () => {
    const a = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    const b = computeFramingWeights(
      fixtureScene(),
      'BACKDOOR_WINDOW',
      'frozen',
    )
    expect(a).toEqual(b)
  })
})
