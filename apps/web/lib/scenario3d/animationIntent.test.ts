/**
 * P2 — Tests for the typed animation-intent layer.
 *
 * Locked contracts:
 *  1. Every v1 AnimationIntent key exists in ALL_ANIMATION_INTENTS.
 *  2. Every decoder × role combination returns a specific expected intent.
 *  3. AOR-01 defender closeout role → CLOSEOUT.
 *  4. AOR receiver branch variants resolve correctly.
 *  5. Unknown/unlisted roles fall back safely (never throws, returns an intent).
 *  6. resolveGlbClipForIntent: CLOSEOUT → 'closeout' when flag on, else 'defense_slide'.
 *  7. resolveGlbClipForIntent: flag-off path unchanged for all intents.
 *  8. getMovementKindIntent: movement kinds map to expected intents.
 *  9. Determinism: same inputs always yield same output.
 */

import { describe, it, expect } from 'vitest'
import {
  ALL_ANIMATION_INTENTS,
  deriveDecoderRole,
  getDecoderAnimationIntent,
  getMovementKindIntent,
  resolveGlbClipForIntent,
  type AnimationIntent,
  type DecoderRole,
} from './animationIntent'

// ---------------------------------------------------------------------------
// 1. ALL_ANIMATION_INTENTS completeness
// ---------------------------------------------------------------------------

describe('ALL_ANIMATION_INTENTS', () => {
  const EXPECTED: AnimationIntent[] = [
    'IDLE_READY',
    'RECEIVE_READY',
    'JAB_OR_RIP',
    'BACK_CUT',
    'EMPTY_SPACE_CUT',
    'DEFENSIVE_DENY',
    'DEFENSIVE_HELP_TURN',
    'CLOSEOUT',
    'SLIDE_RECOVER',
    'PASS_FOLLOWTHROUGH',
    'SHOT_READY',
    'RESET_HOLD',
  ]

  it('contains exactly 12 v1 intents', () => {
    expect(ALL_ANIMATION_INTENTS).toHaveLength(12)
  })

  it.each(EXPECTED)('includes %s', (intent) => {
    expect(ALL_ANIMATION_INTENTS).toContain(intent)
  })
})

// ---------------------------------------------------------------------------
// 2 + 3. Decoder mappings
// ---------------------------------------------------------------------------

describe('getDecoderAnimationIntent — AOR (ADVANTAGE_OR_RESET)', () => {
  it('receiver (no branch) → RECEIVE_READY', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'receiver')).toBe('RECEIVE_READY')
  })

  it('receiver branch=shot → SHOT_READY', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'receiver', 'shot')).toBe('SHOT_READY')
  })

  it('receiver branch=jab_or_rip → JAB_OR_RIP', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'receiver', 'jab_or_rip')).toBe(
      'JAB_OR_RIP',
    )
  })

  it('receiver branch=reset → RESET_HOLD', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'receiver', 'reset')).toBe('RESET_HOLD')
  })

  // AOR-01 specific: defender closes out
  it('AOR-01 closeout_defender → CLOSEOUT', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'closeout_defender')).toBe('CLOSEOUT')
  })

  it('helper_defender → SLIDE_RECOVER', () => {
    expect(getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'helper_defender')).toBe('SLIDE_RECOVER')
  })
})

describe('getDecoderAnimationIntent — BDW (BACKDOOR_WINDOW)', () => {
  it('cutter → BACK_CUT', () => {
    expect(getDecoderAnimationIntent('BACKDOOR_WINDOW', 'cutter')).toBe('BACK_CUT')
  })

  it('deny_defender → DEFENSIVE_DENY', () => {
    expect(getDecoderAnimationIntent('BACKDOOR_WINDOW', 'deny_defender')).toBe('DEFENSIVE_DENY')
  })

  it('passer → PASS_FOLLOWTHROUGH', () => {
    expect(getDecoderAnimationIntent('BACKDOOR_WINDOW', 'passer')).toBe('PASS_FOLLOWTHROUGH')
  })
})

describe('getDecoderAnimationIntent — ESC (EMPTY_SPACE_CUT)', () => {
  it('cutter → EMPTY_SPACE_CUT', () => {
    expect(getDecoderAnimationIntent('EMPTY_SPACE_CUT', 'cutter')).toBe('EMPTY_SPACE_CUT')
  })

  it('receiver → RECEIVE_READY', () => {
    expect(getDecoderAnimationIntent('EMPTY_SPACE_CUT', 'receiver')).toBe('RECEIVE_READY')
  })

  it('helper_defender → DEFENSIVE_HELP_TURN', () => {
    expect(getDecoderAnimationIntent('EMPTY_SPACE_CUT', 'helper_defender')).toBe(
      'DEFENSIVE_HELP_TURN',
    )
  })
})

describe('getDecoderAnimationIntent — SKR (SKIP_THE_ROTATION)', () => {
  it('passer → PASS_FOLLOWTHROUGH', () => {
    expect(getDecoderAnimationIntent('SKIP_THE_ROTATION', 'passer')).toBe('PASS_FOLLOWTHROUGH')
  })

  it('open_player → SHOT_READY', () => {
    expect(getDecoderAnimationIntent('SKIP_THE_ROTATION', 'open_player')).toBe('SHOT_READY')
  })

  it('helper_defender → DEFENSIVE_HELP_TURN', () => {
    expect(getDecoderAnimationIntent('SKIP_THE_ROTATION', 'helper_defender')).toBe(
      'DEFENSIVE_HELP_TURN',
    )
  })

  it('closeout_defender → CLOSEOUT', () => {
    expect(getDecoderAnimationIntent('SKIP_THE_ROTATION', 'closeout_defender')).toBe('CLOSEOUT')
  })
})

// ---------------------------------------------------------------------------
// 5. Safe fallback — every role returns a valid intent for every decoder
// ---------------------------------------------------------------------------

const ALL_DECODERS = [
  'ADVANTAGE_OR_RESET',
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
] as const

const ALL_ROLES: DecoderRole[] = [
  'receiver',
  'cutter',
  'passer',
  'open_player',
  'closeout_defender',
  'helper_defender',
  'deny_defender',
]

describe('getDecoderAnimationIntent — exhaustive fallback safety', () => {
  for (const decoder of ALL_DECODERS) {
    for (const role of ALL_ROLES) {
      it(`${decoder} × ${role} returns a known intent`, () => {
        const result = getDecoderAnimationIntent(decoder, role)
        expect(ALL_ANIMATION_INTENTS).toContain(result)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 6 + 7. resolveGlbClipForIntent — flag on/off
// ---------------------------------------------------------------------------

describe('resolveGlbClipForIntent — CLOSEOUT intent', () => {
  it('returns "closeout" clip when importedCloseoutActive=true', () => {
    expect(
      resolveGlbClipForIntent('CLOSEOUT', {
        importedCloseoutActive: true,
        importedBackCutActive: false,
      }),
    ).toBe('closeout')
  })

  it('falls back to "defense_slide" when importedCloseoutActive=false', () => {
    expect(
      resolveGlbClipForIntent('CLOSEOUT', {
        importedCloseoutActive: false,
        importedBackCutActive: false,
      }),
    ).toBe('defense_slide')
  })
})

describe('resolveGlbClipForIntent — BACK_CUT intent', () => {
  it('returns "back_cut" clip when importedBackCutActive=true', () => {
    expect(
      resolveGlbClipForIntent('BACK_CUT', {
        importedCloseoutActive: false,
        importedBackCutActive: true,
      }),
    ).toBe('back_cut')
  })

  it('falls back to "cut_sprint" when importedBackCutActive=false', () => {
    expect(
      resolveGlbClipForIntent('BACK_CUT', {
        importedCloseoutActive: false,
        importedBackCutActive: false,
      }),
    ).toBe('cut_sprint')
  })

  it('back-cut flag does not leak into other offensive intents', () => {
    // EMPTY_SPACE_CUT, JAB_OR_RIP, RECEIVE_READY, etc. must still
    // resolve to cut_sprint when only importedBackCutActive is on.
    const flags = { importedCloseoutActive: false, importedBackCutActive: true }
    expect(resolveGlbClipForIntent('EMPTY_SPACE_CUT', flags)).toBe('cut_sprint')
    expect(resolveGlbClipForIntent('JAB_OR_RIP', flags)).toBe('cut_sprint')
    expect(resolveGlbClipForIntent('RECEIVE_READY', flags)).toBe('cut_sprint')
    expect(resolveGlbClipForIntent('SHOT_READY', flags)).toBe('cut_sprint')
  })

  it('back-cut flag does not leak into closeout', () => {
    // CLOSEOUT must continue to gate on importedCloseoutActive only.
    expect(
      resolveGlbClipForIntent('CLOSEOUT', {
        importedCloseoutActive: false,
        importedBackCutActive: true,
      }),
    ).toBe('defense_slide')
  })
})

describe('resolveGlbClipForIntent — BDW cutter end-to-end chain', () => {
  it('BDW cutter resolves to BACK_CUT intent', () => {
    expect(getDecoderAnimationIntent('BACKDOOR_WINDOW', 'cutter')).toBe('BACK_CUT')
  })

  it('BDW cutter chain produces back_cut clip when flag on', () => {
    const intent = getDecoderAnimationIntent('BACKDOOR_WINDOW', 'cutter')
    const clip = resolveGlbClipForIntent(intent, {
      importedCloseoutActive: false,
      importedBackCutActive: true,
    })
    expect(intent).toBe('BACK_CUT')
    expect(clip).toBe('back_cut')
  })

  it('BDW cutter chain falls back to cut_sprint when flag off', () => {
    const intent = getDecoderAnimationIntent('BACKDOOR_WINDOW', 'cutter')
    const clip = resolveGlbClipForIntent(intent, {
      importedCloseoutActive: false,
      importedBackCutActive: false,
    })
    expect(intent).toBe('BACK_CUT')
    expect(clip).toBe('cut_sprint')
  })
})

describe('resolveGlbClipForIntent — flag-off path unchanged for all intents', () => {
  const FLAG_OFF = {
    importedCloseoutActive: false,
    importedBackCutActive: false,
  }

  it('IDLE_READY → idle_ready', () => {
    expect(resolveGlbClipForIntent('IDLE_READY', FLAG_OFF)).toBe('idle_ready')
  })

  it('RECEIVE_READY → cut_sprint', () => {
    expect(resolveGlbClipForIntent('RECEIVE_READY', FLAG_OFF)).toBe('cut_sprint')
  })

  it('JAB_OR_RIP → cut_sprint', () => {
    expect(resolveGlbClipForIntent('JAB_OR_RIP', FLAG_OFF)).toBe('cut_sprint')
  })

  it('BACK_CUT → cut_sprint', () => {
    expect(resolveGlbClipForIntent('BACK_CUT', FLAG_OFF)).toBe('cut_sprint')
  })

  it('EMPTY_SPACE_CUT → cut_sprint', () => {
    expect(resolveGlbClipForIntent('EMPTY_SPACE_CUT', FLAG_OFF)).toBe('cut_sprint')
  })

  it('PASS_FOLLOWTHROUGH → cut_sprint', () => {
    expect(resolveGlbClipForIntent('PASS_FOLLOWTHROUGH', FLAG_OFF)).toBe('cut_sprint')
  })

  it('SHOT_READY → cut_sprint', () => {
    expect(resolveGlbClipForIntent('SHOT_READY', FLAG_OFF)).toBe('cut_sprint')
  })

  it('RESET_HOLD → cut_sprint', () => {
    expect(resolveGlbClipForIntent('RESET_HOLD', FLAG_OFF)).toBe('cut_sprint')
  })

  it('DEFENSIVE_DENY → defense_slide', () => {
    expect(resolveGlbClipForIntent('DEFENSIVE_DENY', FLAG_OFF)).toBe('defense_slide')
  })

  it('DEFENSIVE_HELP_TURN → defense_slide', () => {
    expect(resolveGlbClipForIntent('DEFENSIVE_HELP_TURN', FLAG_OFF)).toBe('defense_slide')
  })

  it('SLIDE_RECOVER → defense_slide', () => {
    expect(resolveGlbClipForIntent('SLIDE_RECOVER', FLAG_OFF)).toBe('defense_slide')
  })

  it('CLOSEOUT (flag off) → defense_slide', () => {
    expect(resolveGlbClipForIntent('CLOSEOUT', FLAG_OFF)).toBe('defense_slide')
  })
})

// ---------------------------------------------------------------------------
// 8. getMovementKindIntent — movement-kind table
// ---------------------------------------------------------------------------

describe('getMovementKindIntent', () => {
  it('closeout movement → CLOSEOUT (defense)', () => {
    expect(getMovementKindIntent('closeout', 'defense')).toBe('CLOSEOUT')
  })

  it('closeout movement → CLOSEOUT (offense — position of closer, rare)', () => {
    expect(getMovementKindIntent('closeout', 'offense')).toBe('CLOSEOUT')
  })

  it('back_cut → BACK_CUT (offense)', () => {
    expect(getMovementKindIntent('back_cut', 'offense')).toBe('BACK_CUT')
  })

  it('cut (offense) → EMPTY_SPACE_CUT', () => {
    expect(getMovementKindIntent('cut', 'offense')).toBe('EMPTY_SPACE_CUT')
  })

  it('cut (defense) → DEFENSIVE_HELP_TURN', () => {
    expect(getMovementKindIntent('cut', 'defense')).toBe('DEFENSIVE_HELP_TURN')
  })

  it('pass → PASS_FOLLOWTHROUGH', () => {
    expect(getMovementKindIntent('pass', 'offense')).toBe('PASS_FOLLOWTHROUGH')
  })

  it('skip_pass → PASS_FOLLOWTHROUGH', () => {
    expect(getMovementKindIntent('skip_pass', 'offense')).toBe('PASS_FOLLOWTHROUGH')
  })

  it('rip → JAB_OR_RIP', () => {
    expect(getMovementKindIntent('rip', 'offense')).toBe('JAB_OR_RIP')
  })

  it('jab → JAB_OR_RIP', () => {
    expect(getMovementKindIntent('jab', 'offense')).toBe('JAB_OR_RIP')
  })

  it('rotation (defense) → DEFENSIVE_HELP_TURN', () => {
    expect(getMovementKindIntent('rotation', 'defense')).toBe('DEFENSIVE_HELP_TURN')
  })

  it('stop_ball → DEFENSIVE_DENY', () => {
    expect(getMovementKindIntent('stop_ball', 'defense')).toBe('DEFENSIVE_DENY')
  })

  it('lift → RECEIVE_READY', () => {
    expect(getMovementKindIntent('lift', 'offense')).toBe('RECEIVE_READY')
  })

  it('drift → RECEIVE_READY', () => {
    expect(getMovementKindIntent('drift', 'offense')).toBe('RECEIVE_READY')
  })

  it('decoder+role overrides movement-kind lookup', () => {
    // A 'cut' kind with BDW context and cutter role should be BACK_CUT
    expect(getMovementKindIntent('cut', 'offense', 'BACKDOOR_WINDOW', 'cutter')).toBe('BACK_CUT')
  })
})

// ---------------------------------------------------------------------------
// 8b. deriveDecoderRole — mapping seed-JSON roles to DecoderRole
// ---------------------------------------------------------------------------

describe('deriveDecoderRole — defense', () => {
  it('movement closeout → closeout_defender', () => {
    expect(
      deriveDecoderRole({ team: 'defense', movementKind: 'closeout' }),
    ).toBe('closeout_defender')
  })

  it('movement rotation → helper_defender', () => {
    expect(
      deriveDecoderRole({ team: 'defense', movementKind: 'rotation' }),
    ).toBe('helper_defender')
  })

  it('AOR-01 wing_defender_helping role → helper_defender', () => {
    expect(
      deriveDecoderRole({
        team: 'defense',
        playerRole: 'wing_defender_helping',
        decoder: 'ADVANTAGE_OR_RESET',
      }),
    ).toBe('helper_defender')
  })

  it('low_man role → helper_defender', () => {
    expect(deriveDecoderRole({ team: 'defense', playerRole: 'low_man' })).toBe(
      'helper_defender',
    )
  })

  it('BDW-01 denying_wing_defender role → deny_defender', () => {
    expect(
      deriveDecoderRole({
        team: 'defense',
        playerRole: 'denying_wing_defender',
        decoder: 'BACKDOOR_WINDOW',
      }),
    ).toBe('deny_defender')
  })

  it('on_ball defender role → closeout_defender', () => {
    expect(deriveDecoderRole({ team: 'defense', playerRole: 'on_ball' })).toBe(
      'closeout_defender',
    )
  })

  it('movement kind beats role string (rotation overrides on_ball)', () => {
    expect(
      deriveDecoderRole({
        team: 'defense',
        playerRole: 'on_ball',
        movementKind: 'rotation',
      }),
    ).toBe('helper_defender')
  })
})

describe('deriveDecoderRole — offense', () => {
  it('movement back_cut → cutter', () => {
    expect(
      deriveDecoderRole({ team: 'offense', movementKind: 'back_cut' }),
    ).toBe('cutter')
  })

  it('AOR receiver via wing_shooter role → receiver', () => {
    expect(
      deriveDecoderRole({
        team: 'offense',
        playerRole: 'wing_shooter',
        decoder: 'ADVANTAGE_OR_RESET',
      }),
    ).toBe('receiver')
  })

  it('SKR open shooter via wing_shooter role → open_player', () => {
    expect(
      deriveDecoderRole({
        team: 'offense',
        playerRole: 'wing_shooter',
        decoder: 'SKIP_THE_ROTATION',
      }),
    ).toBe('open_player')
  })

  it('ball_handler role with hasBall → passer', () => {
    expect(
      deriveDecoderRole({
        team: 'offense',
        playerRole: 'ball_handler',
        hasBall: true,
      }),
    ).toBe('passer')
  })

  it('movement pass → passer', () => {
    expect(deriveDecoderRole({ team: 'offense', movementKind: 'pass' })).toBe(
      'passer',
    )
  })

  it('strong_corner offense → open_player', () => {
    expect(
      deriveDecoderRole({ team: 'offense', playerRole: 'strong_corner' }),
    ).toBe('open_player')
  })

  it('AOR isUser tie-breaker → receiver', () => {
    expect(
      deriveDecoderRole({
        team: 'offense',
        isUser: true,
        decoder: 'ADVANTAGE_OR_RESET',
      }),
    ).toBe('receiver')
  })
})

describe('deriveDecoderRole — fallback safety', () => {
  it('returns undefined for unknown defensive role with no movement', () => {
    expect(
      deriveDecoderRole({ team: 'defense', playerRole: 'mystery_role' }),
    ).toBeUndefined()
  })

  it('returns undefined for empty offense context', () => {
    expect(deriveDecoderRole({ team: 'offense' })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 9. Determinism — same inputs always yield same output
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('getDecoderAnimationIntent is pure — same call twice', () => {
    const a = getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'closeout_defender')
    const b = getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'closeout_defender')
    expect(a).toBe(b)
  })

  it('resolveGlbClipForIntent is pure — same call twice', () => {
    const flags = { importedCloseoutActive: true, importedBackCutActive: false }
    const a = resolveGlbClipForIntent('CLOSEOUT', flags)
    const b = resolveGlbClipForIntent('CLOSEOUT', flags)
    expect(a).toBe(b)
  })

  it('getMovementKindIntent is pure — same call twice', () => {
    const a = getMovementKindIntent('closeout', 'defense')
    const b = getMovementKindIntent('closeout', 'defense')
    expect(a).toBe(b)
  })

  it('AOR-01 closeout resolver chain is deterministic end-to-end', () => {
    const intent = getDecoderAnimationIntent('ADVANTAGE_OR_RESET', 'closeout_defender')
    const clipOn = resolveGlbClipForIntent(intent, {
      importedCloseoutActive: true,
      importedBackCutActive: false,
    })
    const clipOff = resolveGlbClipForIntent(intent, {
      importedCloseoutActive: false,
      importedBackCutActive: false,
    })
    expect(intent).toBe('CLOSEOUT')
    expect(clipOn).toBe('closeout')
    expect(clipOff).toBe('defense_slide')
  })
})
