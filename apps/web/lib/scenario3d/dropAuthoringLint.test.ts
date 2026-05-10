/**
 * Pack 2 (Phase β) — DROP authoring lint rule tests.
 *
 * Each rule gets one passing case + one failing case so a future
 * regression in either direction shows up here.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DROP_LINT_FREEZE_CEILING_MS,
  DROP_LINT_FREEZE_FLOOR_MS,
  lintDropFreezeTiming,
  lintDropHasBodyAngleCue,
  lintDropHasMisreadChoice,
  lintDropHasScreenDefender,
  lintDropNoSecondBeat,
  runAllDropLintRules,
  type DropLintScenarioInput,
} from './dropAuthoringLint'

function baseDropScenario(): DropLintScenarioInput {
  return {
    id: 'DROP-test',
    decoder_tag: 'READ_THE_COVERAGE',
    difficulty: 1,
    choices: [
      {
        quality: 'best',
        label: 'Pull up in the pocket.',
        feedback_text: 'Best read.',
      },
      {
        quality: 'wrong',
        label: 'Drive at the big.',
        feedback_text: 'Walks into the chest.',
      },
    ],
    scene: {
      players: [
        { id: 'user', role: 'pnr_ball_handler' },
        { id: 'x_screener', role: 'screen_defender' },
      ],
      freezeMarker: { kind: 'atMs', atMs: 1300 },
      preAnswerOverlays: [
        { kind: 'defender_chest_line', playerId: 'x_screener' },
      ],
    },
  }
}

describe('LINT-DROP-01 — no secondBeat', () => {
  it('passes for a DROP scenario with no beatSpec', () => {
    expect(lintDropNoSecondBeat(baseDropScenario())).toHaveLength(0)
  })

  it('passes for a non-DROP scenario even if a secondBeat is present', () => {
    const s = baseDropScenario()
    s.decoder_tag = 'HUNT_THE_ADVANTAGE'
    s.scene = {
      ...s.scene,
      beatSpec: { firstBeat: { kind: 'atMs', atMs: 1300 }, secondBeat: { kind: 'atMs', atMs: 2400 } },
    }
    expect(lintDropNoSecondBeat(s)).toHaveLength(0)
  })

  it('fails when a DROP scenario authors beatSpec.secondBeat', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      beatSpec: { firstBeat: { kind: 'atMs', atMs: 1300 }, secondBeat: { kind: 'atMs', atMs: 2400 } },
    }
    const issues = lintDropNoSecondBeat(s)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('LINT-DROP-01')
    expect(issues[0]?.severity).toBe('error')
  })
})

describe('LINT-DROP-02 — screen-defender role required', () => {
  it('passes when a screen_defender role is present', () => {
    expect(lintDropHasScreenDefender(baseDropScenario())).toHaveLength(0)
  })

  it('fails when no player carries a screen_def* role', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      players: [
        { id: 'user', role: 'pnr_ball_handler' },
        { id: 'x_user', role: 'on_ball' },
      ],
    }
    const issues = lintDropHasScreenDefender(s)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('LINT-DROP-02')
  })
})

describe('LINT-DROP-03 — body/angle cue required', () => {
  it('passes with a defender_chest_line on the screen defender', () => {
    expect(lintDropHasBodyAngleCue(baseDropScenario())).toHaveLength(0)
  })

  it('passes with a defender_foot_arrow on the screen defender', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      preAnswerOverlays: [
        { kind: 'defender_foot_arrow', playerId: 'x_screener' },
      ],
    }
    expect(lintDropHasBodyAngleCue(s)).toHaveLength(0)
  })

  it('fails when no body cue references the screen defender', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      preAnswerOverlays: [
        { kind: 'help_pulse', playerId: 'x_screener' },
        { kind: 'label' },
      ],
    }
    const issues = lintDropHasBodyAngleCue(s)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('LINT-DROP-03')
  })
})

describe('LINT-DROP-04 — cognition-safe freeze window', () => {
  it('passes inside the [floor, ceiling] window', () => {
    expect(lintDropFreezeTiming(baseDropScenario())).toHaveLength(0)
  })

  it('fails when freezeMarker.atMs is below the floor', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      freezeMarker: { kind: 'atMs', atMs: DROP_LINT_FREEZE_FLOOR_MS - 1 },
    }
    const issues = lintDropFreezeTiming(s)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('LINT-DROP-04')
  })

  it('fails when freezeMarker.atMs is above the ceiling', () => {
    const s = baseDropScenario()
    s.scene = {
      ...s.scene,
      freezeMarker: { kind: 'atMs', atMs: DROP_LINT_FREEZE_CEILING_MS + 1 },
    }
    const issues = lintDropFreezeTiming(s)
    expect(issues).toHaveLength(1)
  })
})

describe('LINT-DROP-05 — coverage-misread wrong choice required', () => {
  it('passes when at least one wrong choice names a coverage misread', () => {
    expect(lintDropHasMisreadChoice(baseDropScenario())).toHaveLength(0)
  })

  it('fails when wrong choices do not name a coverage misread', () => {
    const s = baseDropScenario()
    s.choices = [
      { quality: 'best', label: 'Pull up.', feedback_text: 'Best.' },
      { quality: 'wrong', label: 'Yell at the ref.', feedback_text: 'Off topic.' },
    ]
    const issues = lintDropHasMisreadChoice(s)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('LINT-DROP-05')
  })

  it('fails when no quality=wrong choice exists', () => {
    const s = baseDropScenario()
    s.choices = [
      { quality: 'best', label: 'Pull up.', feedback_text: 'Best.' },
      { quality: 'acceptable', label: 'Snake.', feedback_text: 'Okay.' },
    ]
    const issues = lintDropHasMisreadChoice(s)
    expect(issues).toHaveLength(1)
  })
})

describe('runAllDropLintRules — non-DROP scenarios produce zero issues', () => {
  it('skips Pack 1 BDW scenarios entirely', () => {
    const bdw: DropLintScenarioInput = {
      id: 'BDW-01',
      decoder_tag: 'BACKDOOR_WINDOW',
      choices: [],
      scene: {
        players: [],
        preAnswerOverlays: [],
      },
    }
    expect(runAllDropLintRules(bdw)).toHaveLength(0)
  })
})

describe('runAllDropLintRules — DROP-01 production scenario passes every rule', () => {
  it('the authored DROP-01 fixture is clean under all five rules', async () => {
    const file = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'seed',
      'scenarios',
      'packs',
      'pnr-coverage-v0',
      'DROP-01.json',
    )
    const raw = await fs.readFile(file, 'utf8')
    const arr = JSON.parse(raw) as DropLintScenarioInput[]
    const issues = runAllDropLintRules(arr[0]!)
    expect(issues).toEqual([])
  })
})
