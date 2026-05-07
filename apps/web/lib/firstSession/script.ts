/**
 * Phase 5 — First Great Session script.
 *
 * This module defines the deterministic 5-rep arc a brand-new player
 * walks through in their first 10–15 minutes. It is a *script*, not a
 * weighted bundle: order, UI mode, disguise, and decoder are all
 * pinned. Every brand-new player gets the same arc so the recognition
 * moments are tuned by hand, not emergent.
 *
 * Consumed by:
 *   - scenarioService.generateSessionBundle (when the user has 0 prior
 *     attempts on their first /train load — see firstSession.compose)
 *   - /train UI (reads the per-rep `uiMode` to decide which chrome to
 *     show / hide)
 *   - /train summary (reads `isFirstSession` to render the small,
 *     calm summary instead of the full dashboard CTA)
 *
 * The script does NOT invent scenarios — it picks them from the LIVE
 * library. If the library can't satisfy the script (e.g. no AOR
 * scenario authored yet), the composer downgrades gracefully to the
 * best-available match for that step rather than skipping.
 */

import type { DecoderTag } from '../pathways/types'

/**
 * UI-mode flags read by /train per rep. The defaults below describe
 * the tightest cold-start chrome the train page must respect; any
 * `false` is the dashboard returning.
 */
export interface FirstSessionUiMode {
  /** Hide the decoder pill in the header. */
  suppressDecoderPill: boolean
  /** Hide the phase tracker at the top of /train. */
  suppressPhaseTracker: boolean
  /** Hide the XP / IQ / streak chip cluster. */
  suppressHeaderChips: boolean
  /** Hide the difficulty tag (D1/D2/...) on the scenario header. */
  suppressDifficultyTag: boolean
  /** Hide the self-review checklist (rep 1–3 — the player has no
   *  framework for these yet). */
  suppressSelfReviewChecklist: boolean
  /** Hide manual replay controls; the answer demo plays automatically. */
  suppressReplayControls: boolean
  /** Show the small framing line above the play instead of the full
   *  pre-freeze caption. */
  useGuidedFramingLine: boolean
  /** Reveal the decoder name AFTER the answer instead of in the
   *  header. */
  revealDecoderAfterAnswer: boolean
  /** Auto-loop the play once before the freeze fires (rep 1 only). */
  autoLoopBeforeFreeze: boolean
}

export interface FirstSessionStep {
  /** 1-based step in the arc. */
  rep: 1 | 2 | 3 | 4 | 5
  /** What this rep is FOR — a coach can read this. */
  intent:
    | 'first-recognition'
    | 'recognition-mirror'
    | 'recognition-transfer'
    | 'cross-decoder-introduction'
    | 'session-close'
  /** Decoder this rep should land on. The composer matches this against
   *  scenario.decoder_tag in the LIVE catalog. */
  decoder: DecoderTag
  /** Disguise level the rep should surface. The materializer encodes
   *  this in `sub_concepts` as `sig:...|disg:<level>|...`. */
  disguise: 'none' | 'light' | 'moderate'
  /** Catalog selector — the composer prefers a scenario matching ALL
   *  fields, then relaxes from right to left. */
  prefer: {
    /** Match a specific template id (`tpl:<id>` in sub_concepts). */
    templateId?: string
    /** Match a mirror flip (sig contains `mirror|`). */
    mirror?: boolean
    /** Allow scenarios from a *different* template than rep N — used
     *  by transfer steps to enforce variety. */
    differentTemplateThanRep?: number
    /** Match a difficulty band. */
    difficulty?: number
  }
  uiMode: FirstSessionUiMode
  /** One-line, post-answer eyebrow shown to the player. Templated with
   *  the decoder label and the player's latency. */
  recognitionLine: (decoderLabel: string, latencyMs: number) => string
}

/** The maximally tight cold-start mode used on rep 1. */
const COLD_START_MODE: FirstSessionUiMode = {
  suppressDecoderPill: true,
  suppressPhaseTracker: true,
  suppressHeaderChips: true,
  suppressDifficultyTag: true,
  suppressSelfReviewChecklist: true,
  suppressReplayControls: true,
  useGuidedFramingLine: true,
  revealDecoderAfterAnswer: true,
  autoLoopBeforeFreeze: true,
}

/** Reps 2–3: most chrome still off, but the player has seen the
 *  decoder name once and knows the loop. */
const RECOGNITION_MODE: FirstSessionUiMode = {
  ...COLD_START_MODE,
  autoLoopBeforeFreeze: false,
}

/** Rep 3 graduation: decoder pill returns, but everything else stays
 *  calm. */
const GRADUATION_MODE: FirstSessionUiMode = {
  suppressDecoderPill: false,
  suppressPhaseTracker: true,
  suppressHeaderChips: true,
  suppressDifficultyTag: true,
  suppressSelfReviewChecklist: true,
  suppressReplayControls: true,
  useGuidedFramingLine: false,
  revealDecoderAfterAnswer: false,
  autoLoopBeforeFreeze: false,
}

/** Rep 4: cross-decoder. Brief return to the cold-start framing so the
 *  player meets the new decoder the same way they met BDW. */
const CROSS_DECODER_MODE: FirstSessionUiMode = {
  ...GRADUATION_MODE,
  suppressDecoderPill: true,
  useGuidedFramingLine: true,
  revealDecoderAfterAnswer: true,
}

/** Rep 5: the close. Self-review back on (only on miss), replay back
 *  on. Difficulty tag + chips stay off — those wait for session 2. */
const SESSION_CLOSE_MODE: FirstSessionUiMode = {
  suppressDecoderPill: false,
  suppressPhaseTracker: true,
  suppressHeaderChips: true,
  suppressDifficultyTag: true,
  suppressSelfReviewChecklist: false,
  suppressReplayControls: false,
  useGuidedFramingLine: false,
  revealDecoderAfterAnswer: false,
  autoLoopBeforeFreeze: false,
}

/**
 * The locked first-session arc. Edit this only with intent — every
 * rep here was tuned for a recognition moment.
 */
export const FIRST_SESSION_SCRIPT: readonly FirstSessionStep[] = [
  {
    rep: 1,
    intent: 'first-recognition',
    decoder: 'BACKDOOR_WINDOW',
    disguise: 'moderate', // strip overlays to one cue — see strategy §8
    prefer: { templateId: 'BDW.denied-wing', mirror: false, difficulty: 1 },
    uiMode: COLD_START_MODE,
    recognitionLine: (label) => `You saw the ${label}.`,
  },
  {
    rep: 2,
    intent: 'recognition-mirror',
    decoder: 'BACKDOOR_WINDOW',
    disguise: 'none',
    prefer: { templateId: 'BDW.denied-wing', mirror: true, difficulty: 1 },
    uiMode: RECOGNITION_MODE,
    recognitionLine: (label, latencyMs) =>
      latencyMs < 3500
        ? `Faster this time. You're starting to read the ${label}.`
        : `Same read, other side. You're starting to see it.`,
  },
  {
    rep: 3,
    intent: 'recognition-transfer',
    decoder: 'BACKDOOR_WINDOW',
    disguise: 'none',
    prefer: { differentTemplateThanRep: 2, difficulty: 1 },
    uiMode: GRADUATION_MODE,
    recognitionLine: (label) => `Three reads in three reps. The ${label} is becoming yours.`,
  },
  {
    rep: 4,
    intent: 'cross-decoder-introduction',
    decoder: 'ADVANTAGE_OR_RESET',
    disguise: 'none',
    prefer: { templateId: 'AOR.short-closeout-shoot', mirror: false, difficulty: 1 },
    uiMode: CROSS_DECODER_MODE,
    recognitionLine: (label) => `New pattern. You read the ${label}.`,
  },
  {
    rep: 5,
    intent: 'session-close',
    decoder: 'BACKDOOR_WINDOW',
    disguise: 'light',
    prefer: { templateId: 'BDW.denied-wing', mirror: false, difficulty: 2 },
    uiMode: SESSION_CLOSE_MODE,
    recognitionLine: (label, latencyMs) =>
      `${label} — read in ${(latencyMs / 1000).toFixed(1)}s.`,
  },
] as const

/** Returns true while the player is inside the first-session arc. */
export function isInFirstSession(input: {
  attemptsCount: number | null
  scenarioIndex: number
}): boolean {
  if (input.attemptsCount === null) return false
  return input.attemptsCount + input.scenarioIndex < FIRST_SESSION_SCRIPT.length
}

/** Returns the script step for the player's current absolute attempt
 *  number (0-based). Returns null when the player has graduated. */
export function getFirstSessionStep(input: {
  attemptsCount: number | null
  scenarioIndex: number
}): FirstSessionStep | null {
  if (input.attemptsCount === null) return null
  const idx = input.attemptsCount + input.scenarioIndex
  if (idx >= FIRST_SESSION_SCRIPT.length) return null
  return FIRST_SESSION_SCRIPT[idx] ?? null
}

/** Default UI mode for any non-first-session rep. The dashboard is
 *  back. */
export const NORMAL_UI_MODE: FirstSessionUiMode = {
  suppressDecoderPill: false,
  suppressPhaseTracker: false,
  suppressHeaderChips: false,
  suppressDifficultyTag: false,
  suppressSelfReviewChecklist: false,
  suppressReplayControls: false,
  useGuidedFramingLine: false,
  revealDecoderAfterAnswer: false,
  autoLoopBeforeFreeze: false,
}
