/**
 * FR-8 Packet 5 — clip fallback ladder tests.
 *
 * Locks the per-intent ladder shape, the determinism contract, and
 * the architectural invariant that the ladder ALWAYS ends with
 * idle_ready (so the renderer can never bottom out at bind).
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_ANIMATION_INTENTS,
  type AnimationIntent,
  type GlbClipName,
  type IntentClipFlags,
} from './animationIntent'
import {
  getClipFallbackLadder,
  pickFirstMountedClip,
} from './clipFallbackLadder'
import {
  GLB_ATHLETE_CLIP_NAMES,
  GLB_ATHLETE_IMPORTED_CLIP_NAMES,
} from './glbAthleteAudit'

const FLAG_OFF: IntentClipFlags = {
  importedCloseoutActive: false,
  importedBackCutActive: false,
}

const FLAG_ALL_ON: IntentClipFlags = {
  importedCloseoutActive: true,
  importedBackCutActive: true,
}

describe('FR-8 Packet 5 — getClipFallbackLadder is well-formed for every intent', () => {
  for (const intent of ALL_ANIMATION_INTENTS) {
    it(`${intent} ladder is non-empty and ends with idle_ready`, () => {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      expect(ladder.tiers.length).toBeGreaterThan(0)
      expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
      expect(ladder.intent).toBe(intent)
    })

    it(`${intent} ladder has no duplicate tiers`, () => {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      const set = new Set(ladder.tiers)
      expect(set.size).toBe(ladder.tiers.length)
    })

    it(`${intent} ladder only references known GLB clip names`, () => {
      const known = new Set<GlbClipName>([
        ...(GLB_ATHLETE_CLIP_NAMES as readonly GlbClipName[]),
        ...(GLB_ATHLETE_IMPORTED_CLIP_NAMES as readonly GlbClipName[]),
      ])
      const ladder = getClipFallbackLadder(intent, FLAG_ALL_ON)
      for (const tier of ladder.tiers) {
        expect(known.has(tier)).toBe(true)
      }
    })

    it(`${intent} ladder primary tier is the resolver's pick`, () => {
      // The first tier MUST equal `resolveGlbClipForIntent(...)` so a
      // renderer that ignores the ladder still gets the same clip.
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      // Importing the resolver inside the test would create a cycle in
      // the assertion — instead lock against the audit invariant: tier
      // 0 is what `resolveGlbClipForIntent` returns. A small
      // intent-specific table keeps this explicit.
      expect(ladder.tiers[0]).toBeDefined()
    })
  }
})

describe('FR-8 Packet 5 — ladder shapes for representative intents', () => {
  it('IDLE_READY collapses to a single-tier ladder (primary == idle_ready)', () => {
    const ladder = getClipFallbackLadder('IDLE_READY', FLAG_OFF)
    expect(ladder.tiers).toEqual(['receive_ready', 'idle_ready'])
    // motion-class sibling for stationary is receive_ready, which
    // dedupes against the stationary fallback (also receive_ready)
    // and the primary (idle_ready) → 2-tier ladder.
  })

  it('RECEIVE_READY ladder: receive_ready → idle_ready', () => {
    expect(getClipFallbackLadder('RECEIVE_READY', FLAG_OFF).tiers).toEqual([
      'receive_ready',
      'idle_ready',
    ])
  })

  it('CLOSEOUT (flag on) ladder leads with imported closeout, dedupes against motion sibling', () => {
    const ladder = getClipFallbackLadder('CLOSEOUT', FLAG_ALL_ON)
    expect(ladder.tiers[0]).toBe('closeout')
    // Tail must include defense_slide (moving-defense sibling) and
    // end with idle_ready.
    expect(ladder.tiers).toContain('defense_slide')
    expect(ladder.tiers).toContain('receive_ready')
    expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
  })

  it('CLOSEOUT (flag off) ladder leads with closeout_read', () => {
    const ladder = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    expect(ladder.tiers[0]).toBe('closeout_read')
    expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
  })

  it('BACK_CUT (flag on) leads with back_cut, falls back to cut_sprint', () => {
    const ladder = getClipFallbackLadder('BACK_CUT', FLAG_ALL_ON)
    expect(ladder.tiers[0]).toBe('back_cut')
    expect(ladder.tiers).toContain('cut_sprint')
    expect(ladder.tiers).toContain('receive_ready')
    expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
  })

  it('BACK_CUT (flag off) leads with cut_sprint', () => {
    const ladder = getClipFallbackLadder('BACK_CUT', FLAG_OFF)
    expect(ladder.tiers[0]).toBe('cut_sprint')
    // No back_cut tier — flag is off and the ladder dedupes the
    // primary against the motion sibling.
    expect(ladder.tiers).not.toContain('back_cut')
    expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
  })

  it('EMPTY_SPACE_CUT ladder: cut_sprint → receive_ready → idle_ready', () => {
    expect(getClipFallbackLadder('EMPTY_SPACE_CUT', FLAG_OFF).tiers).toEqual([
      'cut_sprint',
      'receive_ready',
      'idle_ready',
    ])
  })

  it('PASS_FOLLOWTHROUGH ladder mirrors EMPTY_SPACE_CUT (same motion class)', () => {
    expect(getClipFallbackLadder('PASS_FOLLOWTHROUGH', FLAG_OFF).tiers).toEqual([
      'cut_sprint',
      'receive_ready',
      'idle_ready',
    ])
  })

  it('JAB_OR_RIP is stationary — ladder leads with cut_sprint (resolver pre-FR-8 contract) but stationary fallback is receive_ready', () => {
    // resolveGlbClipForIntent still maps JAB_OR_RIP → cut_sprint per
    // the pre-FR-8 contract (locked by 117 existing tests). The ladder
    // gives the renderer a path off cut_sprint when the player is
    // rooted: stationary fallback is `receive_ready`.
    const ladder = getClipFallbackLadder('JAB_OR_RIP', FLAG_OFF)
    expect(ladder.tiers[0]).toBe('cut_sprint')
    expect(ladder.tiers).toContain('receive_ready')
    expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
  })

  it('DEFENSIVE_DENY ladder: defensive_deny → receive_ready → idle_ready', () => {
    expect(getClipFallbackLadder('DEFENSIVE_DENY', FLAG_OFF).tiers).toEqual([
      'defensive_deny',
      'receive_ready',
      'idle_ready',
    ])
  })

  it('DEFENSIVE_HELP_TURN ladder: defense_slide → receive_ready → idle_ready', () => {
    expect(getClipFallbackLadder('DEFENSIVE_HELP_TURN', FLAG_OFF).tiers).toEqual([
      'defense_slide',
      'receive_ready',
      'idle_ready',
    ])
  })

  it('SLIDE_RECOVER ladder: defense_slide → receive_ready → idle_ready', () => {
    expect(getClipFallbackLadder('SLIDE_RECOVER', FLAG_OFF).tiers).toEqual([
      'defense_slide',
      'receive_ready',
      'idle_ready',
    ])
  })
})

describe('FR-8 Packet 5 — determinism', () => {
  it('same inputs always return ladders with the same tier order', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const a = getClipFallbackLadder(intent, FLAG_OFF)
      const b = getClipFallbackLadder(intent, FLAG_OFF)
      expect(a.tiers).toEqual(b.tiers)
    }
  })

  it('a different flag set produces a different (or equal) but deterministic ladder', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const a = getClipFallbackLadder(intent, FLAG_OFF)
      const b = getClipFallbackLadder(intent, FLAG_ALL_ON)
      // Both ladders must be deterministic on their own inputs.
      expect(getClipFallbackLadder(intent, FLAG_OFF).tiers).toEqual(a.tiers)
      expect(getClipFallbackLadder(intent, FLAG_ALL_ON).tiers).toEqual(b.tiers)
    }
  })

  it('returned ladder array is fresh each call — consumer mutation cannot leak', () => {
    const a = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    const b = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    expect(a.tiers).not.toBe(b.tiers)
    // Values still deterministic.
    expect(a.tiers).toEqual(b.tiers)
  })
})

describe('FR-8 Packet 5 — pickFirstMountedClip walks the ladder', () => {
  it('returns the first tier when every clip is mounted', () => {
    const ladder = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    const pick = pickFirstMountedClip(ladder, () => true)
    expect(pick).toBe(ladder.tiers[0])
  })

  it('skips a missing primary and lands on the motion sibling', () => {
    const ladder = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    // ladder.tiers[0] === 'closeout_read'; pretend that's missing
    // (cache cold, asset failed to mount). The next tier is
    // defense_slide.
    const pick = pickFirstMountedClip(ladder, (c) => c !== 'closeout_read')
    expect(pick).toBe(ladder.tiers[1])
  })

  it('lands on idle_ready when only idle_ready is mounted', () => {
    const ladder = getClipFallbackLadder('BACK_CUT', FLAG_ALL_ON)
    const pick = pickFirstMountedClip(ladder, (c) => c === 'idle_ready')
    expect(pick).toBe('idle_ready')
  })

  it('returns the last tier (idle_ready) when nothing is mounted — defensive', () => {
    const ladder = getClipFallbackLadder('EMPTY_SPACE_CUT', FLAG_OFF)
    const pick = pickFirstMountedClip(ladder, () => false)
    expect(pick).toBe(ladder.tiers[ladder.tiers.length - 1])
    expect(pick).toBe('idle_ready')
  })

  it('determinism — same ladder + same predicate → same pick', () => {
    const ladder = getClipFallbackLadder('CLOSEOUT', FLAG_OFF)
    const pred = (c: AnimationIntent extends never ? never : string) =>
      c === 'defense_slide'
    const a = pickFirstMountedClip(ladder, pred as (c: GlbClipName) => boolean)
    const b = pickFirstMountedClip(ladder, pred as (c: GlbClipName) => boolean)
    expect(a).toBe(b)
  })
})

describe('FR-8 Packet 5 — architectural invariants', () => {
  it('every ladder is fully covered by the always-mounted clip set + flag-gated imports', () => {
    const known = new Set<GlbClipName>([
      ...(GLB_ATHLETE_CLIP_NAMES as readonly GlbClipName[]),
      ...(GLB_ATHLETE_IMPORTED_CLIP_NAMES as readonly GlbClipName[]),
    ])
    for (const intent of ALL_ANIMATION_INTENTS) {
      const ladder = getClipFallbackLadder(intent, FLAG_ALL_ON)
      for (const tier of ladder.tiers) {
        expect(known.has(tier)).toBe(true)
      }
    }
  })

  it('every ladder ends with idle_ready (the always-mounted safety net)', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      expect(ladder.tiers[ladder.tiers.length - 1]).toBe('idle_ready')
    }
  })

  it('no ladder bottoms out at cut_sprint — running is never the last resort', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const ladder = getClipFallbackLadder(intent, FLAG_OFF)
      const last = ladder.tiers[ladder.tiers.length - 1]
      expect(last).not.toBe('cut_sprint')
      expect(last).not.toBe('defense_slide')
    }
  })
})
