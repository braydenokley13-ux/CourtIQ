/**
 * P2.1 — Integration tests for `pickGlbClipForState` with decoder +
 * role context.
 *
 * Locks the new wiring contract (P2.1 + P2.6):
 *  1. AOR closeout_defender + 'closeout' movement → 'closeout' clip
 *     (when imported flag on) or 'closeout_read' (P2.6, when off).
 *  2. BDW cutter → 'cut_sprint' (intent BACK_CUT).
 *  3. BDW deny_defender → 'defensive_deny' (intent DEFENSIVE_DENY).
 *  4. ESC cutter → 'cut_sprint' (intent EMPTY_SPACE_CUT).
 *  5. ESC helper_defender → 'defense_slide' (intent DEFENSIVE_HELP_TURN).
 *  6. SKR open_player → 'receive_ready' (P2.6, intent SHOT_READY).
 *  7. AOR receiver moving → 'receive_ready' (P2.6, intent RECEIVE_READY).
 *  8. Missing role → falls through to movement-kind path.
 *  9. Stationary offense → 'idle_ready' regardless of decoder + role.
 * 10. Defense + closeout + isMoving=false → closeout_read via resolver
 *     (P2.6 — preserves stance hold but uses the forward-closeout pose).
 * 11. Stationary BDW deny_defender → 'defensive_deny' for freeze readability.
 */

/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import {
  IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY,
  IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY,
  pickGlbClipForState,
} from './imperativeScene'

function setImportedCloseoutFlag(value: boolean): void {
  ;(window as unknown as Record<string, unknown>)[
    IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY
  ] = value
}

function setImportedBackCutFlag(value: boolean): void {
  ;(window as unknown as Record<string, unknown>)[
    IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY
  ] = value
}

describe('pickGlbClipForState — AOR (ADVANTAGE_OR_RESET)', () => {
  afterEach(() => {
    setImportedCloseoutFlag(false)
  })

  it('closeout_defender on closeout movement → closeout clip when flag on', () => {
    setImportedCloseoutFlag(true)
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'closeout',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'closeout_defender',
      }),
    ).toBe('closeout')
  })

  it('P2.6 — closeout_defender on closeout movement → closeout_read when flag off', () => {
    // Pre-P2.6 the flag-off fallback was `defense_slide` (lateral
    // shifting). P2.6 introduces `closeout_read` — a forward-closeout
    // procedural pose with high inside hand — so the deterministic
    // fallback matches the teaching cue (closeout = forward sprint),
    // not the lateral slide of a help defender.
    setImportedCloseoutFlag(false)
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'closeout',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'closeout_defender',
      }),
    ).toBe('closeout_read')
  })

  it('helper_defender moving → defense_slide (intent SLIDE_RECOVER)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'rotation',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'helper_defender',
      }),
    ).toBe('defense_slide')
  })

  it('P2.6 — receiver moving → receive_ready (intent RECEIVE_READY)', () => {
    // Pre-P2.6 routing sent RECEIVE_READY through the offensive
    // moving fallback `cut_sprint`, which made a lifting catcher
    // run in place. P2.6 routes it to the dedicated `receive_ready`
    // pose so the catch / read body language stays calm.
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'lift',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'receiver',
      }),
    ).toBe('receive_ready')
  })
})

describe('pickGlbClipForState — BDW (BACKDOOR_WINDOW)', () => {
  afterEach(() => {
    setImportedBackCutFlag(false)
  })

  it('cutter on a generic cut → cut_sprint when the back-cut flag is off', () => {
    setImportedBackCutFlag(false)
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'cut',
        isMoving: true,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'cutter',
      }),
    ).toBe('cut_sprint')
  })

  it('cutter on a generic cut → back_cut when the back-cut flag is on', () => {
    setImportedBackCutFlag(true)
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'cut',
        isMoving: true,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'cutter',
      }),
    ).toBe('back_cut')
  })

  it('deny_defender → defensive_deny (intent DEFENSIVE_DENY)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: undefined,
        isMoving: true,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'deny_defender',
      }),
    ).toBe('defensive_deny')
  })

  it('passer moving → cut_sprint (intent PASS_FOLLOWTHROUGH)', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'pass',
        isMoving: true,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'passer',
      }),
    ).toBe('cut_sprint')
  })
})

describe('pickGlbClipForState — ESC (EMPTY_SPACE_CUT)', () => {
  it('cutter on a generic cut → cut_sprint (intent EMPTY_SPACE_CUT)', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'cut',
        isMoving: true,
        decoderTag: 'EMPTY_SPACE_CUT',
        role: 'cutter',
      }),
    ).toBe('cut_sprint')
  })

  it('helper_defender → defense_slide (intent DEFENSIVE_HELP_TURN)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: undefined,
        isMoving: true,
        decoderTag: 'EMPTY_SPACE_CUT',
        role: 'helper_defender',
      }),
    ).toBe('defense_slide')
  })
})

describe('pickGlbClipForState — SKR (SKIP_THE_ROTATION)', () => {
  it('P2.6 — open_player moving → receive_ready (intent SHOT_READY)', () => {
    // Pre-P2.6 SHOT_READY routed through `cut_sprint`. P2.6 routes
    // catch-and-shoot stationary intents to `receive_ready` so the
    // SKR weakside shooter does not run in place at the freeze.
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'lift',
        isMoving: true,
        decoderTag: 'SKIP_THE_ROTATION',
        role: 'open_player',
      }),
    ).toBe('receive_ready')
  })

  it('helper_defender → defense_slide', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'rotation',
        isMoving: true,
        decoderTag: 'SKIP_THE_ROTATION',
        role: 'helper_defender',
      }),
    ).toBe('defense_slide')
  })
})

describe('pickGlbClipForState — fallback when role is missing', () => {
  it('P2.6 — decoderTag without role → movement-kind path resolves CLOSEOUT to closeout_read (flag off)', () => {
    // Defense closeout still routes through `resolveGlbClipForIntent`
    // even without a derived role; P2.6 changes the fallback from
    // `defense_slide` to `closeout_read`.
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'closeout',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        // role intentionally omitted
      }),
    ).toBe('closeout_read')
  })

  it('no decoder context at all → movement-kind path (offense cut)', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'cut',
        isMoving: true,
      }),
    ).toBe('cut_sprint')
  })

  it('no decoder context at all → movement-kind path (defense moving)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'rotation',
        isMoving: true,
      }),
    ).toBe('defense_slide')
  })

  it('offense moving with unhandled kind and no decoder → idle_ready', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'pass',
        isMoving: true,
      }),
    ).toBe('idle_ready')
  })
})

describe('pickGlbClipForState — stationary semantics preserved', () => {
  it('stationary offense ignores decoder/role and returns idle_ready', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'cut',
        isMoving: false,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'cutter',
      }),
    ).toBe('idle_ready')
  })

  it('stationary defense + closeout still resolves CLOSEOUT through the gate', () => {
    setImportedCloseoutFlag(true)
    try {
      expect(
        pickGlbClipForState({
          team: 'defense',
          kind: 'closeout',
          isMoving: false,
          decoderTag: 'ADVANTAGE_OR_RESET',
          role: 'closeout_defender',
        }),
      ).toBe('closeout')
    } finally {
      setImportedCloseoutFlag(false)
    }
  })

  it('stationary defense + rotation → defense_slide (stance hold)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'rotation',
        isMoving: false,
      }),
    ).toBe('defense_slide')
  })

  it('stationary BDW deny_defender keeps the denial cue readable', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: undefined,
        isMoving: false,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'deny_defender',
      }),
    ).toBe('defensive_deny')
  })
})

describe('pickGlbClipForState — determinism', () => {
  afterEach(() => {
    setImportedCloseoutFlag(false)
    setImportedBackCutFlag(false)
  })

  it('same inputs always yield same output (BDW cutter)', () => {
    const args = {
      team: 'offense' as const,
      kind: 'cut' as const,
      isMoving: true,
      decoderTag: 'BACKDOOR_WINDOW' as const,
      role: 'cutter' as const,
    }
    expect(pickGlbClipForState(args)).toBe(pickGlbClipForState(args))
  })

  it('AOR closeout chain is deterministic across flag toggles', () => {
    setImportedCloseoutFlag(false)
    const off1 = pickGlbClipForState({
      team: 'defense',
      kind: 'closeout',
      isMoving: true,
      decoderTag: 'ADVANTAGE_OR_RESET',
      role: 'closeout_defender',
    })
    const off2 = pickGlbClipForState({
      team: 'defense',
      kind: 'closeout',
      isMoving: true,
      decoderTag: 'ADVANTAGE_OR_RESET',
      role: 'closeout_defender',
    })
    // P2.6 — flag-off CLOSEOUT now lands on `closeout_read`.
    expect(off1).toBe('closeout_read')
    expect(off2).toBe('closeout_read')

    setImportedCloseoutFlag(true)
    const on1 = pickGlbClipForState({
      team: 'defense',
      kind: 'closeout',
      isMoving: true,
      decoderTag: 'ADVANTAGE_OR_RESET',
      role: 'closeout_defender',
    })
    const on2 = pickGlbClipForState({
      team: 'defense',
      kind: 'closeout',
      isMoving: true,
      decoderTag: 'ADVANTAGE_OR_RESET',
      role: 'closeout_defender',
    })
    expect(on1).toBe('closeout')
    expect(on2).toBe('closeout')
    setImportedCloseoutFlag(false)
  })

  it('BDW back-cut chain is deterministic across flag toggles', () => {
    const args = {
      team: 'offense' as const,
      kind: 'cut' as const,
      isMoving: true,
      decoderTag: 'BACKDOOR_WINDOW' as const,
      role: 'cutter' as const,
    }

    setImportedBackCutFlag(false)
    expect(pickGlbClipForState(args)).toBe('cut_sprint')
    expect(pickGlbClipForState(args)).toBe('cut_sprint')

    setImportedBackCutFlag(true)
    expect(pickGlbClipForState(args)).toBe('back_cut')
    expect(pickGlbClipForState(args)).toBe('back_cut')
  })
})
