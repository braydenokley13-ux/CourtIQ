/**
 * FR-8 Packet 7 — QA sweep across all 20 founder-v0 scenarios.
 *
 * Stand-in for the manual `/dev/scenario-preview + ?debugFilmRoom=1`
 * walkthrough. Walks the full QA matrix against:
 *
 *   - the resolveGlbClipForIntent contract for every decoder × role
 *     combination relevant to the scenario;
 *   - the clip fallback ladder for every intent the resolver picks;
 *   - the §6.1 fallback-tier order;
 *   - architectural invariants the renderer depends on (every
 *     resolved clip is either in the always-mounted set or behind a
 *     feature flag).
 *
 * Pure-data driven — no canvas, no THREE.js. The tests provide a
 * regression net for the cases a manual QA pass would otherwise have
 * to catch by eye.
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_ANIMATION_INTENTS,
  getDecoderAnimationIntent,
  getIntentMotionClass,
  resolveGlbClipForIntent,
  type AnimationIntent,
  type DecoderRole,
  type IntentClipFlags,
} from './animationIntent'
import { getClipFallbackLadder } from './clipFallbackLadder'
import {
  GLB_ATHLETE_CLIP_NAMES,
  GLB_ATHLETE_IMPORTED_CLIP_NAMES,
  GLB_FALLBACK_LADDER_ORDER,
} from './glbAthleteAudit'
import { QA_MATRIX } from './qaMatrix'

const FLAG_OFF: IntentClipFlags = {
  importedCloseoutActive: false,
  importedBackCutActive: false,
}

const FLAG_ON: IntentClipFlags = {
  importedCloseoutActive: true,
  importedBackCutActive: true,
}

const KNOWN_CLIPS = new Set<string>([
  ...GLB_ATHLETE_CLIP_NAMES,
  ...GLB_ATHLETE_IMPORTED_CLIP_NAMES,
])

const ROLES_PER_DECODER: Readonly<Record<string, readonly DecoderRole[]>> = {
  BACKDOOR_WINDOW: ['cutter', 'deny_defender', 'passer', 'helper_defender'],
  EMPTY_SPACE_CUT: ['cutter', 'receiver', 'helper_defender', 'passer'],
  ADVANTAGE_OR_RESET: [
    'receiver',
    'closeout_defender',
    'helper_defender',
    'passer',
  ],
  SKIP_THE_ROTATION: [
    'passer',
    'open_player',
    'helper_defender',
    'closeout_defender',
  ],
}

describe('FR-8 Packet 7 — QA matrix is intact', () => {
  it('exactly 20 founder-v0 scenarios', () => {
    expect(QA_MATRIX).toHaveLength(20)
  })

  it('all four founder families are covered', () => {
    const families = new Set(QA_MATRIX.map((e) => e.decoder))
    expect(families.size).toBe(4)
  })
})

describe('FR-8 Packet 7 — every QA-matrix scenario resolves to a known clip for every role', () => {
  for (const entry of QA_MATRIX) {
    const roles = ROLES_PER_DECODER[entry.decoder] ?? []
    for (const role of roles) {
      it(`${entry.id} (${entry.decoder} × ${role}) — flag-off resolver pick is mounted`, () => {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const clip = resolveGlbClipForIntent(intent, FLAG_OFF)
        expect(KNOWN_CLIPS.has(clip)).toBe(true)
      })

      it(`${entry.id} (${entry.decoder} × ${role}) — flag-on resolver pick is mounted`, () => {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const clip = resolveGlbClipForIntent(intent, FLAG_ON)
        expect(KNOWN_CLIPS.has(clip)).toBe(true)
      })
    }
  }
})

describe('FR-8 Packet 7 — every intent that the QA matrix produces has a valid ladder', () => {
  it('every (decoder, role) combo from the QA matrix yields a ladder ending with idle_ready', () => {
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const ladder = getClipFallbackLadder(intent, FLAG_OFF)
        expect(ladder.tiers.length).toBeGreaterThan(0)
        expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
      }
    }
  })

  it('every QA-matrix ladder tier resolves to a known clip', () => {
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const ladder = getClipFallbackLadder(intent, FLAG_ON)
        for (const tier of ladder.tiers) {
          expect(KNOWN_CLIPS.has(tier)).toBe(true)
        }
      }
    }
  })

  it('moving-defense intents in the QA matrix never bottom out at cut_sprint', () => {
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        if (getIntentMotionClass(intent) !== 'moving-defense') continue
        const ladder = getClipFallbackLadder(intent, FLAG_OFF)
        expect(ladder.tiers).not.toContain('cut_sprint')
      }
    }
  })
})

describe('FR-8 Packet 7 — fallback hierarchy stays §6.1', () => {
  it('audit ladder exposes all 5 tiers in plan order', () => {
    expect(GLB_FALLBACK_LADDER_ORDER[0]).toBe('glb-with-clip')
    expect(GLB_FALLBACK_LADDER_ORDER[1]).toBe('glb-with-idle')
    expect(GLB_FALLBACK_LADDER_ORDER[2]).toBe('procedural')
    expect(GLB_FALLBACK_LADDER_ORDER[3]).toBe('two-d')
    expect(GLB_FALLBACK_LADDER_ORDER[4]).toBe('magenta-proxy')
  })

  it('GLB tier is always preferred over procedural', () => {
    const glbTierIdx = GLB_FALLBACK_LADDER_ORDER.indexOf('glb-with-clip')
    const procIdx = GLB_FALLBACK_LADDER_ORDER.indexOf('procedural')
    expect(glbTierIdx).toBeLessThan(procIdx)
  })

  it('procedural tier is always preferred over two-d', () => {
    const procIdx = GLB_FALLBACK_LADDER_ORDER.indexOf('procedural')
    const twoDIdx = GLB_FALLBACK_LADDER_ORDER.indexOf('two-d')
    expect(procIdx).toBeLessThan(twoDIdx)
  })
})

describe('FR-8 Packet 7 — determinism across the QA sweep', () => {
  it('the same QA sweep run twice yields the same ladders byte-for-byte', () => {
    const first: Record<string, string[]> = {}
    const second: Record<string, string[]> = {}
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const key = `${entry.id}:${role}:${intent}`
        first[key] = [...getClipFallbackLadder(intent, FLAG_OFF).tiers]
      }
    }
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const key = `${entry.id}:${role}:${intent}`
        second[key] = [...getClipFallbackLadder(intent, FLAG_OFF).tiers]
      }
    }
    expect(second).toEqual(first)
  })
})

describe('FR-8 Packet 7 — silhouette safety: no intent ever falls back to bind', () => {
  it('every intent produces a ladder whose final tier is a real clip name (idle_ready)', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      const last = ladder.tiers[ladder.tiers.length - 1]
      expect(KNOWN_CLIPS.has(last)).toBe(true)
      expect(last).toBe('idle_ready')
    }
  })

  it('every intent produces a ladder whose tier 0 is a real clip', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      const first = ladder.tiers[0]
      expect(KNOWN_CLIPS.has(first)).toBe(true)
    }
  })
})

describe('FR-8 Packet 7 — feature-flag flips do not break the QA sweep', () => {
  it('flipping importedCloseoutActive does not introduce phantom clip names', () => {
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const flagOff = getClipFallbackLadder(intent, FLAG_OFF)
        const flagOn = getClipFallbackLadder(intent, {
          importedCloseoutActive: true,
          importedBackCutActive: false,
        })
        for (const tier of [...flagOff.tiers, ...flagOn.tiers]) {
          expect(KNOWN_CLIPS.has(tier)).toBe(true)
        }
      }
    }
  })

  it('flipping importedBackCutActive does not introduce phantom clip names', () => {
    for (const entry of QA_MATRIX) {
      const roles = ROLES_PER_DECODER[entry.decoder] ?? []
      for (const role of roles) {
        const intent = getDecoderAnimationIntent(entry.decoder, role)
        const flagOff = getClipFallbackLadder(intent, FLAG_OFF)
        const flagOn = getClipFallbackLadder(intent, {
          importedCloseoutActive: false,
          importedBackCutActive: true,
        })
        for (const tier of [...flagOff.tiers, ...flagOn.tiers]) {
          expect(KNOWN_CLIPS.has(tier)).toBe(true)
        }
      }
    }
  })
})
