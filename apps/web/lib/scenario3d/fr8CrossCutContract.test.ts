/**
 * FR-8 Packet 8 — cross-cut contract tests.
 *
 * Pulls the FR-2 (GLB load stability) and FR-3 (figure scale +
 * shadow) contracts together with the FR-8 audit module so a
 * regression in any of the three layers fails this single file.
 *
 * Specifically:
 *   - clip resolution is total: every (intent, flag-state) tuple
 *     resolves to a valid clip — there is no `undefined` exit;
 *   - the fallback ladder never produces a clip outside the
 *     audit-known set;
 *   - the §7.8 figure scale contract budget is unchanged from
 *     pre-FR-8 (FR-3 lock);
 *   - the §6.1 fallback hierarchy stays in plan order (FR-2 lock).
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_ANIMATION_INTENTS,
  resolveGlbClipForIntent,
  type GlbClipName,
  type IntentClipFlags,
} from './animationIntent'
import { getClipFallbackLadder } from './clipFallbackLadder'
import {
  GLB_ATHLETE_CLIP_NAMES,
  GLB_ATHLETE_IMPORTED_CLIP_NAMES,
  GLB_FALLBACK_LADDER_ORDER,
  GLB_RIG_TARGET_HEIGHT_FT,
  PLAYER_HEIGHT_DELTA_BUDGET_FT,
  PROCEDURAL_FIGURE_HEIGHT_FT,
} from './glbAthleteAudit'
import {
  BASKETBALL_READY_BONE_KEYS,
  BASKETBALL_READY_REST_DELTA,
} from './glbAthleticPose'

const FLAG_STATES: readonly IntentClipFlags[] = [
  { importedCloseoutActive: false, importedBackCutActive: false },
  { importedCloseoutActive: true, importedBackCutActive: false },
  { importedCloseoutActive: false, importedBackCutActive: true },
  { importedCloseoutActive: true, importedBackCutActive: true },
] as const

const KNOWN_CLIPS = new Set<GlbClipName>([
  ...(GLB_ATHLETE_CLIP_NAMES as readonly GlbClipName[]),
  ...(GLB_ATHLETE_IMPORTED_CLIP_NAMES as readonly GlbClipName[]),
])

describe('FR-8 Packet 8 — clip resolution is total', () => {
  it('resolveGlbClipForIntent returns a defined clip for every (intent, flag-state)', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const clip = resolveGlbClipForIntent(intent, flags)
        expect(clip).toBeDefined()
        expect(typeof clip).toBe('string')
        expect(KNOWN_CLIPS.has(clip)).toBe(true)
      }
    }
  })

  it('clip ladder never returns an unknown clip name across all flag states', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const ladder = getClipFallbackLadder(intent, flags)
        for (const tier of ladder.tiers) {
          expect(KNOWN_CLIPS.has(tier)).toBe(true)
        }
      }
    }
  })

  it('clip ladder length is at least 1 for every (intent, flag-state)', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const ladder = getClipFallbackLadder(intent, flags)
        expect(ladder.tiers.length).toBeGreaterThan(0)
      }
    }
  })

  it('clip ladder length is at most 4 (primary, motion sibling, stationary, idle_ready) — bounded surface', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const ladder = getClipFallbackLadder(intent, flags)
        expect(ladder.tiers.length).toBeLessThanOrEqual(4)
      }
    }
  })
})

describe('FR-8 Packet 8 — FR-3 scale contract still holds', () => {
  it('GLB and procedural figure heights are within the §7.8 budget', () => {
    expect(
      Math.abs(GLB_RIG_TARGET_HEIGHT_FT - PROCEDURAL_FIGURE_HEIGHT_FT),
    ).toBeLessThanOrEqual(PLAYER_HEIGHT_DELTA_BUDGET_FT)
  })

  it('FR-3 budget is unchanged from pre-FR-8 (0.05 ft)', () => {
    expect(PLAYER_HEIGHT_DELTA_BUDGET_FT).toBe(0.05)
  })
})

describe('FR-8 Packet 8 — FR-2 fallback hierarchy still §6.1 order', () => {
  it('fallback ladder is exactly the 5-tier §6.1 sequence', () => {
    expect(GLB_FALLBACK_LADDER_ORDER).toEqual([
      'glb-with-clip',
      'glb-with-idle',
      'procedural',
      'two-d',
      'magenta-proxy',
    ])
  })
})

describe('FR-8 Packet 8 — basketball-ready rest delta is byte-stable', () => {
  it('every audited bone is still touched and the X / Y / Z values are unchanged', () => {
    // Byte-level snapshot. Any future packet that tweaks the rest
    // delta has to update this array intentionally.
    const SNAPSHOT: ReadonlyArray<{ key: string; x: number; y: number; z: number }> =
      [
        { key: 'leftThigh', x: -0.14, y: 0, z: 0 },
        { key: 'rightThigh', x: -0.14, y: 0, z: 0 },
        { key: 'leftShin', x: 0.08, y: 0, z: 0 },
        { key: 'rightShin', x: 0.08, y: 0, z: 0 },
        { key: 'leftUpperArm', x: 2.3, y: 0, z: 0.02 },
        { key: 'rightUpperArm', x: 2.3, y: 0, z: -0.02 },
        { key: 'leftForeArm', x: 0, y: -0.42, z: 0 },
        { key: 'rightForeArm', x: 0, y: -0.42, z: 0 },
      ]
    expect(BASKETBALL_READY_BONE_KEYS).toHaveLength(SNAPSHOT.length)
    for (const snap of SNAPSHOT) {
      const d =
        BASKETBALL_READY_REST_DELTA[
          snap.key as (typeof BASKETBALL_READY_BONE_KEYS)[number]
        ]
      expect(d.x).toBe(snap.x)
      expect(d.y).toBe(snap.y)
      expect(d.z).toBe(snap.z)
    }
  })
})

describe('FR-8 Packet 8 — determinism preserved end-to-end', () => {
  it('same intent + same flags → same resolver pick across many calls', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const a = resolveGlbClipForIntent(intent, flags)
        const b = resolveGlbClipForIntent(intent, flags)
        const c = resolveGlbClipForIntent(intent, flags)
        expect(a).toBe(b)
        expect(b).toBe(c)
      }
    }
  })

  it('same intent + same flags → same ladder tier order across many calls', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      for (const flags of FLAG_STATES) {
        const a = getClipFallbackLadder(intent, flags).tiers
        const b = getClipFallbackLadder(intent, flags).tiers
        expect(a).toEqual(b)
      }
    }
  })
})

describe('FR-8 Packet 8 — no scenario JSON change required', () => {
  // FR-8 success criterion: "no scenario JSON changes". Lock the
  // fact that the resolver / ladder / audit modules never read
  // scenario JSON — they accept intents + flags and nothing else.
  it('resolveGlbClipForIntent signature accepts only intent + flags (no scene reads)', () => {
    expect(resolveGlbClipForIntent.length).toBe(2)
  })

  it('getClipFallbackLadder signature accepts only intent + flags', () => {
    expect(getClipFallbackLadder.length).toBe(2)
  })
})
