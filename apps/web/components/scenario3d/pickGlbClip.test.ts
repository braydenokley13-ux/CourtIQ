/**
 * P2.1 — Integration tests for `pickGlbClipForState` with decoder +
 * role context.
 *
 * Locks the new wiring contract:
 *  1. AOR closeout_defender + 'closeout' movement → 'closeout' clip
 *     (when imported flag on) or 'defense_slide' (when off).
 *  2. BDW cutter → 'cut_sprint' (intent BACK_CUT).
 *  3. BDW deny_defender → 'defense_slide' (intent DEFENSIVE_DENY).
 *  4. ESC cutter → 'cut_sprint' (intent EMPTY_SPACE_CUT).
 *  5. ESC helper_defender → 'defense_slide' (intent DEFENSIVE_HELP_TURN).
 *  6. SKR open_player → 'cut_sprint' (intent SHOT_READY).
 *  7. AOR receiver moving → 'cut_sprint' (intent RECEIVE_READY).
 *  8. Missing role → falls through to movement-kind path.
 *  9. Stationary players → 'idle_ready' regardless of decoder + role.
 * 10. Defense + closeout + isMoving=false → defense_slide via resolver
 *     (preserves Phase O-ANIM stance hold).
 */

/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import {
  IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY,
  pickGlbClipForState,
} from './imperativeScene'

function setImportedCloseoutFlag(value: boolean): void {
  ;(window as unknown as Record<string, unknown>)[
    IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY
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

  it('closeout_defender on closeout movement → defense_slide when flag off', () => {
    setImportedCloseoutFlag(false)
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'closeout',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'closeout_defender',
      }),
    ).toBe('defense_slide')
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

  it('receiver moving → cut_sprint (intent RECEIVE_READY)', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'lift',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        role: 'receiver',
      }),
    ).toBe('cut_sprint')
  })
})

describe('pickGlbClipForState — BDW (BACKDOOR_WINDOW)', () => {
  it('cutter on a generic cut → cut_sprint (intent BACK_CUT)', () => {
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

  it('deny_defender → defense_slide (intent DEFENSIVE_DENY)', () => {
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: undefined,
        isMoving: true,
        decoderTag: 'BACKDOOR_WINDOW',
        role: 'deny_defender',
      }),
    ).toBe('defense_slide')
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
  it('open_player moving → cut_sprint (intent SHOT_READY)', () => {
    expect(
      pickGlbClipForState({
        team: 'offense',
        kind: 'lift',
        isMoving: true,
        decoderTag: 'SKIP_THE_ROTATION',
        role: 'open_player',
      }),
    ).toBe('cut_sprint')
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
  it('decoderTag without role → movement-kind path', () => {
    // Defense closeout — same result as pre-P2.1.
    expect(
      pickGlbClipForState({
        team: 'defense',
        kind: 'closeout',
        isMoving: true,
        decoderTag: 'ADVANTAGE_OR_RESET',
        // role intentionally omitted
      }),
    ).toBe('defense_slide')
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
})

describe('pickGlbClipForState — determinism', () => {
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
    expect(off1).toBe('defense_slide')
    expect(off2).toBe('defense_slide')

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
})
