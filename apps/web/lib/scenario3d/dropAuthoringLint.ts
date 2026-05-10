/**
 * Pack 2 (Phase β) — DROP authoring lint rules.
 *
 * Five quality checks for DROP / READ_THE_COVERAGE production
 * scenarios. The rules complement the runtime scene schema (which
 * gates structural validity) by catching DROP-specific authoring
 * mistakes the schema cannot see:
 *
 *   LINT-DROP-01  READ_THE_COVERAGE scenarios must not author a
 *                 secondBeat. DROP is single-freeze; a secondBeat
 *                 silently drags the chained-freeze bridge into a
 *                 DROP rep.
 *
 *   LINT-DROP-02  DROP scenarios must include at least one player
 *                 whose role substring identifies the screen
 *                 defender (`screen_defender`, or any role name
 *                 containing `screen_def`). Without that anchor the
 *                 cognition module's screen_defender hydration target
 *                 is absent and the cue beat silently disappears.
 *
 *   LINT-DROP-03  DROP pre-answer overlays must include at least one
 *                 body / angle primitive on the screen defender —
 *                 `defender_chest_line` OR `defender_foot_arrow`.
 *                 The chest / foot cues are how the player learns to
 *                 see drop coverage; an overlay cluster without one
 *                 of them ships a "name this coverage" rep with no
 *                 visual cue.
 *
 *   LINT-DROP-04  DROP freeze marker must fall inside the cognition-
 *                 safe window. Too early and the pre-freeze ramp is
 *                 cut off; too late and the rep stalls. D1/D2 floor
 *                 / ceiling values come from the cognition module's
 *                 ramp + hold windows.
 *
 *   LINT-DROP-05  DROP choices must include at least one wrong read
 *                 whose feedback names attacking into the big or
 *                 missing the pocket — proves the misread is
 *                 designed-for, not an arbitrary distractor.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No I/O, no DB. The lint takes a parsed
 *     scenario shape and returns a list of issues.
 *   - The lint accepts ANY scenario; non-DROP scenarios produce zero
 *     issues. That makes it cheap to run across the whole pack
 *     library without a decoder filter.
 *   - Severities mirror lint-variants.ts: 'error' fails the run,
 *     'warn' surfaces but does not block.
 */

import {
  FREEZE_COGNITION_HOLD_MS,
  FREEZE_RAMP_WINDOW_MS,
} from './freezeFrameCognition'

/** Minimum freeze marker time so the pre-freeze ramp window fits.
 *  Identical to FREEZE_RAMP_WINDOW_MS (600ms) — pulled into a named
 *  export so the lint message can cite the exact value. */
export const DROP_LINT_FREEZE_FLOOR_MS = FREEZE_RAMP_WINDOW_MS

/** Maximum freeze marker time for D1/D2 reps. Picked so cognition
 *  fires inside the first 4-second beat envelope; D≥3 shapes (longer
 *  setup) live in a separate slice and may relax this gate. */
export const DROP_LINT_FREEZE_CEILING_MS = 3_000

/** Word list used by LINT-DROP-05 to detect a "misread the coverage"
 *  wrong choice. Kept tight on purpose — adding too many synonyms
 *  weakens the rule into a tautology. */
const COVERAGE_MISREAD_PATTERN =
  /\b(big|chest|paint|reset|drive|recover|pocket)\b/i

/** Severity values mirror scripts/lint-variants.ts. */
export type DropLintSeverity = 'warn' | 'error'

/** A single lint finding. `rule` matches the LINT-DROP-NN ids in the
 *  module docstring. */
export interface DropLintIssue {
  rule: 'LINT-DROP-01' | 'LINT-DROP-02' | 'LINT-DROP-03' | 'LINT-DROP-04' | 'LINT-DROP-05'
  severity: DropLintSeverity
  scenarioId: string
  message: string
}

/** Minimal subset of the parsed-scenario shape the lint needs. The
 *  lint module does not own the schema; callers pass already-parsed
 *  scenario JSON so this stays a pure helper. */
export interface DropLintScenarioInput {
  id: string
  decoder_tag?: string | null
  difficulty?: number
  choices?: ReadonlyArray<{
    quality?: 'best' | 'acceptable' | 'wrong'
    label: string
    feedback_text?: string
  }>
  scene?: {
    players?: ReadonlyArray<{ id: string; role: string }>
    freezeMarker?: { kind: 'atMs'; atMs: number } | { kind: 'beforeMovementId'; movementId: string }
    movements?: ReadonlyArray<{ id: string; delayMs?: number; durationMs?: number }>
    beatSpec?: {
      firstBeat?: unknown
      secondBeat?: unknown
    }
    preAnswerOverlays?: ReadonlyArray<{ kind: string; playerId?: string }>
  }
}

/** Returns true when the scenario's decoder_tag identifies a DROP rep. */
function isDropScenario(scenario: DropLintScenarioInput): boolean {
  return scenario.decoder_tag === 'READ_THE_COVERAGE'
}

/**
 * LINT-DROP-01 — DROP must not declare a secondBeat. Single-freeze
 * is part of the decoder's pedagogy (the player reads coverage in one
 * pass). Authoring a secondBeat opts the scene into the chained-
 * freeze bridge transition that was designed for HUNT.
 */
export function lintDropNoSecondBeat(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  if (!isDropScenario(scenario)) return []
  const beatSpec = scenario.scene?.beatSpec
  if (!beatSpec) return []
  if (beatSpec.secondBeat !== undefined && beatSpec.secondBeat !== null) {
    return [
      {
        rule: 'LINT-DROP-01',
        severity: 'error',
        scenarioId: scenario.id,
        message: `DROP / READ_THE_COVERAGE scenario "${scenario.id}" authors beatSpec.secondBeat. DROP is single-freeze — remove the secondBeat or change the decoder.`,
      },
    ]
  }
  return []
}

/**
 * LINT-DROP-02 — DROP scenarios must declare a screen-defender role.
 * The cognition module hydrates the screen_defender anchor from a
 * scene player; without one the cue beat silently drops.
 */
export function lintDropHasScreenDefender(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  if (!isDropScenario(scenario)) return []
  const players = scenario.scene?.players ?? []
  const hasScreenDefender = players.some((p) =>
    /screen_def/i.test(p.role),
  )
  if (hasScreenDefender) return []
  return [
    {
      rule: 'LINT-DROP-02',
      severity: 'error',
      scenarioId: scenario.id,
      message: `DROP scenario "${scenario.id}" must include a player whose role identifies the screen defender (substring "screen_def"). Without it the freeze cue beat has no anchor.`,
    },
  ]
}

/**
 * LINT-DROP-03 — DROP pre-answer overlays must include at least one
 * body/angle primitive (defender_chest_line OR defender_foot_arrow)
 * referencing the screen defender. Other primitives (label,
 * help_pulse) are allowed alongside but cannot substitute for the
 * body cue.
 */
export function lintDropHasBodyAngleCue(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  if (!isDropScenario(scenario)) return []
  const overlays = scenario.scene?.preAnswerOverlays ?? []
  const players = scenario.scene?.players ?? []
  const screenDefenderIds = new Set(
    players.filter((p) => /screen_def/i.test(p.role)).map((p) => p.id),
  )
  const cue = overlays.find(
    (o) =>
      (o.kind === 'defender_chest_line' || o.kind === 'defender_foot_arrow') &&
      (o.playerId !== undefined && screenDefenderIds.has(o.playerId)),
  )
  if (cue) return []
  return [
    {
      rule: 'LINT-DROP-03',
      severity: 'error',
      scenarioId: scenario.id,
      message: `DROP scenario "${scenario.id}" pre-answer overlays do not include a defender_chest_line or defender_foot_arrow on the screen defender. Add a body/angle cue.`,
    },
  ]
}

/**
 * LINT-DROP-04 — Freeze marker timing must be inside the D1/D2
 * cognition-safe window. Only enforced when the marker is
 * `kind: atMs`; `beforeMovementId` requires resolving the movement
 * graph and is left to runtime.
 */
export function lintDropFreezeTiming(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  if (!isDropScenario(scenario)) return []
  const marker = scenario.scene?.freezeMarker
  if (!marker || marker.kind !== 'atMs') return []
  if (
    marker.atMs < DROP_LINT_FREEZE_FLOOR_MS ||
    marker.atMs > DROP_LINT_FREEZE_CEILING_MS
  ) {
    return [
      {
        rule: 'LINT-DROP-04',
        severity: 'error',
        scenarioId: scenario.id,
        message: `DROP scenario "${scenario.id}" freezeMarker.atMs=${marker.atMs} is outside the D1/D2 cognition-safe window [${DROP_LINT_FREEZE_FLOOR_MS}, ${DROP_LINT_FREEZE_CEILING_MS}]ms. Adjust the marker so the pre-freeze ramp (${FREEZE_RAMP_WINDOW_MS}ms) and cognition hold (${FREEZE_COGNITION_HOLD_MS}ms) both fit.`,
      },
    ]
  }
  return []
}

/**
 * LINT-DROP-05 — Choice menu must include at least one wrong read
 * whose copy names a misread of drop coverage (attacking into the
 * big, missing the pocket, resetting out of the advantage). Distractor
 * choices that don't anchor on the coverage taxonomy fail the rule.
 */
export function lintDropHasMisreadChoice(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  if (!isDropScenario(scenario)) return []
  const choices = scenario.choices ?? []
  const wrongs = choices.filter((c) => c.quality === 'wrong')
  if (wrongs.length === 0) {
    return [
      {
        rule: 'LINT-DROP-05',
        severity: 'error',
        scenarioId: scenario.id,
        message: `DROP scenario "${scenario.id}" has no quality='wrong' choice. Add a misread that names attacking into the big or missing the pocket.`,
      },
    ]
  }
  const misread = wrongs.find((c) =>
    COVERAGE_MISREAD_PATTERN.test(`${c.label} ${c.feedback_text ?? ''}`),
  )
  if (misread) return []
  return [
    {
      rule: 'LINT-DROP-05',
      severity: 'error',
      scenarioId: scenario.id,
      message: `DROP scenario "${scenario.id}" wrong choices do not name a coverage misread (big / chest / paint / reset / drive / recover / pocket). Add a wrong read that walks into the big or wastes the pocket.`,
    },
  ]
}

/** Convenience: run every DROP rule and concatenate the findings. */
export function runAllDropLintRules(
  scenario: DropLintScenarioInput,
): DropLintIssue[] {
  return [
    ...lintDropNoSecondBeat(scenario),
    ...lintDropHasScreenDefender(scenario),
    ...lintDropHasBodyAngleCue(scenario),
    ...lintDropFreezeTiming(scenario),
    ...lintDropHasMisreadChoice(scenario),
  ]
}
