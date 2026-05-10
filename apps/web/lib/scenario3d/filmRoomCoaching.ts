/**
 * Phase D — Part 2D (seed)
 * Interactive Film Room Layer — coaching-script + mastery contract.
 *
 * Owns the pure-data contract that maps
 *
 *     (decoder, trainingMode, mastery, repCount)
 *
 * to the scalars the renderer + UI surfaces need to drive a
 * pedagogically clean film-room session: pre-freeze watch window,
 * scan targets, early-answer window, coach voice, rewind allowance.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No THREE.js. No clocks. No DOM.
 *   - Same inputs always produce the same outputs.
 *   - This module never owns scenario timing, never owns clip
 *     selection, never owns route geometry. It only tells the
 *     existing surfaces (overlay scheduler, replay controller,
 *     premium overlay UI, scoring) HOW MUCH HELP to render.
 *   - Off-axis combinations collapse to the safest defaults
 *     (full guidance). Never throws, never returns undefined.
 *   - Reuses the existing PathwayTrainingMode and OverlayLevel
 *     unions — no parallel taxonomy.
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - imperativeTeachingOverlay   reads `config.scanTargets` to
 *                                 emit pre-freeze attention beats
 *                                 in the existing 'watch' phase.
 *   - ScenarioReplayController    reads `config.earlyAnswerWindowMs`
 *                                 to widen the choice-acceptance
 *                                 window before freeze.
 *   - PremiumOverlay              reads `config.rewindAllowed` to
 *                                 mount/hide the +/-1s scrub buttons.
 *   - Scoring (outcome layer)     reads `wasAnticipated(t, freezeAtMs,
 *                                 config)` to flag bestPlus reads.
 *   - Coach-voice label primitive reads `getCoachVoiceText(...)` to
 *                                 emit a single label-sprite beat.
 */

import type { DecoderTag } from './schema'
import type { PathwayTrainingMode } from '@/lib/pathways/types'

// --- mastery model ---------------------------------------------------------

/**
 * Per-decoder, per-user mastery tier. Driven by rolling decoder
 * accuracy + attempt count from the existing PassCriteria fields;
 * this module just consumes the scalar.
 *
 *   first_exposure → 1–2 attempts on this decoder, any accuracy
 *   recognizing    → 3–5 attempts with >= 50% best-rate
 *   fluent         → 6+ attempts with >= 70% best-rate
 *   mastered       → 11+ attempts with >= 80% best-rate AND
 *                    >= 3 unique scenarios read correctly
 */
export type MasteryTier =
  | 'first_exposure'
  | 'recognizing'
  | 'fluent'
  | 'mastered'

export const DEFAULT_MASTERY: MasteryTier = 'first_exposure'

// --- coach voice -----------------------------------------------------------

export type CoachVoiceLevel = 'explicit' | 'guided' | 'minimal' | 'silent'

/** Single short utterance, decoder-keyed, level-keyed. Same wording
 *  across reps — repetition is part of the pedagogy, not noise. */
const COACH_VOICE: Record<DecoderTag, Record<CoachVoiceLevel, string | null>> = {
  BACKDOOR_WINDOW: {
    explicit: 'Watch his eyes.',
    guided: 'Where is he looking?',
    minimal: 'Read the denial.',
    silent: null,
  },
  EMPTY_SPACE_CUT: {
    explicit: 'Watch the helper.',
    guided: 'Whose space opened?',
    minimal: 'Cut into space.',
    silent: null,
  },
  SKIP_THE_ROTATION: {
    explicit: 'Two defenders, one read.',
    guided: 'Who got pulled?',
    minimal: 'Punish the help.',
    silent: null,
  },
  ADVANTAGE_OR_RESET: {
    explicit: 'Watch the closeout.',
    guided: 'Is he balanced?',
    minimal: 'Read the closeout.',
    silent: null,
  },
  // Pack 2 stub. Coach voice for DROP / HUNT will be authored alongside
  // the decoder presets in 3.1.2; until then `silent: null` ensures any
  // accidental DROP/HUNT scenario plays without a voice line rather than
  // dropping a founder coach voice on the wrong family.
  READ_THE_COVERAGE: {
    explicit: null,
    guided: null,
    minimal: null,
    silent: null,
  },
  // Pack 2 (Phase γ) — HUNT chained-second-read voice. The voice is
  // shorter than DROP's because HUNT's load is in the temporal chain,
  // not the visual identification — over-talking blunts the second
  // read.
  HUNT_THE_ADVANTAGE: {
    explicit: 'Force the switch, hunt the mismatch.',
    guided: 'Who do they have to switch onto?',
    minimal: 'Hunt the mismatch.',
    silent: null,
  },
}

/** Returns the coach-voice text for a decoder + level, or `null` if
 *  the level is silent or the decoder is unknown. Pure. */
export function getCoachVoiceText(
  decoder: DecoderTag | undefined,
  level: CoachVoiceLevel,
): string | null {
  if (!decoder) return null
  return COACH_VOICE[decoder]?.[level] ?? null
}

// --- scan targets ----------------------------------------------------------

/**
 * Scan targets are decoder-specific symbolic anchors the renderer
 * highlights during the WATCH phase. The values are pure-data tags;
 * the renderer hydrates them into faint OverlayBeats with the
 * existing primitives (defender_vision_cone, defender_hip_arrow,
 * defender_foot_arrow, open_space_region, …).
 *
 * Order is meaningful: index 0 = primary, index 1 = secondary. The
 * mastery-driven `scanTargetCount` field below truncates the list.
 */
export type ScanTargetTag =
  | 'defender_head'
  | 'defender_hips'
  | 'cutter_plant_foot'
  | 'helper_hips'
  | 'vacated_zone'
  | 'two_helpers_pulled'
  | 'closeout_speed'
  | 'closeout_balance'
  | 'receiver_hands'
  /** HUNT — the size / matchup gap on the post-switch defender. */
  | 'mismatch_target_size'
  /** HUNT — the post-switch defender's hip / foot recovery angle. */
  | 'switch_defender_hips'

const DECODER_SCAN_TARGETS: Record<DecoderTag, ReadonlyArray<ScanTargetTag>> = {
  BACKDOOR_WINDOW: ['defender_head', 'cutter_plant_foot'],
  EMPTY_SPACE_CUT: ['helper_hips', 'vacated_zone'],
  SKIP_THE_ROTATION: ['two_helpers_pulled', 'receiver_hands'],
  ADVANTAGE_OR_RESET: ['closeout_balance', 'closeout_speed'],
  // Pack 2 stub. DROP would surface screen-defender depth / hip
  // orientation; the ScanTargetTag union doesn't yet contain those
  // tags — extending it lands with a follow-on DROP slice. Empty
  // arrays are safe: the WATCH-phase renderer treats an empty target
  // list as "no scan emphasis" and just shows the freeze.
  READ_THE_COVERAGE: [],
  // Pack 2 (Phase γ) — HUNT scan targets. Primary scan is the size
  // gap (the matchup itself); secondary is the recovery hip angle on
  // beat 2 — the chain the player learns to read in time.
  HUNT_THE_ADVANTAGE: ['mismatch_target_size', 'switch_defender_hips'],
}

// --- coaching-script config ------------------------------------------------

export type RewindAllowance = 'off' | 'restart_only' | 'one_second' | 'full_scrub'

export interface FilmRoomCoachingConfig {
  /** Pre-freeze "watch" window the user can study while the scenario
   *  plays. The renderer surfaces scan targets during this window. */
  watchWindowMs: number
  /** Symbolic scan-target tags to highlight during watch. The renderer
   *  hydrates each tag into a faint OverlayBeat at phase='watch'. */
  scanTargets: ReadonlyArray<ScanTargetTag>
  /** When true, the choice tray accepts a pick before freeze, in the
   *  last `earlyAnswerWindowMs` ms before freezeAtMs. */
  earlyAnswerEnabled: boolean
  /** Width of the early-answer window before freezeAtMs (ms). */
  earlyAnswerWindowMs: number
  /** Coach-voice intensity. */
  coachVoice: CoachVoiceLevel
  /** Whether the user can rewind, and how much. */
  rewindAllowed: RewindAllowance
  /** Whether the post-answer compare button ("show best read") is
   *  surfaced as an explicit control. */
  postAnswerCompare: boolean
  /** Whether the scenario opts into the two-pass watch-first replay. */
  watchFirstReplay: boolean
}

const DEFAULT_WATCH_WINDOW_MS = 600
const DEFAULT_EARLY_ANSWER_WINDOW_MS = 800

const SAFE_DEFAULT_CONFIG: FilmRoomCoachingConfig = Object.freeze({
  watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
  scanTargets: [],
  earlyAnswerEnabled: false,
  earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
  coachVoice: 'minimal',
  rewindAllowed: 'restart_only',
  postAnswerCompare: false,
  watchFirstReplay: false,
}) as FilmRoomCoachingConfig

// ---------------------------------------------------------------------------
// Per-mode base table. Numbers from § 12 of the Part-2D doc.
// Mastery + repCount are applied as overrides on top of the mode base.
// ---------------------------------------------------------------------------

const MODE_BASE: Record<PathwayTrainingMode, FilmRoomCoachingConfig> = {
  'learn-the-cue': {
    watchWindowMs: 800,
    scanTargets: [], // filled in per decoder by getFilmRoomCoachingConfig
    earlyAnswerEnabled: false,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'explicit',
    rewindAllowed: 'one_second',
    postAnswerCompare: true,
    watchFirstReplay: false,
  },
  'freeze-frame-read': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: false,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'guided',
    rewindAllowed: 'one_second',
    postAnswerCompare: true,
    watchFirstReplay: false,
  },
  'no-hint': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: true,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'minimal',
    rewindAllowed: 'one_second',
    postAnswerCompare: true,
    watchFirstReplay: false,
  },
  'mixed-reads': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: true,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'minimal',
    rewindAllowed: 'one_second',
    postAnswerCompare: true,
    watchFirstReplay: false,
  },
  'boss-challenge': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: true,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'silent',
    rewindAllowed: 'restart_only',
    postAnswerCompare: false,
    watchFirstReplay: false,
  },
  'pressure-test': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: true,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'silent',
    rewindAllowed: 'off',
    postAnswerCompare: false,
    watchFirstReplay: false,
  },
  'film-room': {
    watchWindowMs: DEFAULT_WATCH_WINDOW_MS,
    scanTargets: [],
    earlyAnswerEnabled: false,
    earlyAnswerWindowMs: DEFAULT_EARLY_ANSWER_WINDOW_MS,
    coachVoice: 'minimal',
    rewindAllowed: 'full_scrub',
    postAnswerCompare: true,
    watchFirstReplay: true,
  },
}

// ---------------------------------------------------------------------------
// Mastery overrides. Each tier subtracts help; never adds. The
// reduction is monotonic — a user moving from `recognizing` to
// `fluent` never re-enables a coach-voice level they passed.
// ---------------------------------------------------------------------------

const MASTERY_OVERRIDES: Record<
  MasteryTier,
  {
    /** How many of the decoder's authored scan targets are visible. */
    scanTargetCount: number
    /** Forced coach voice ceiling — the resulting level is the
     *  *lower* of the mode base and this ceiling. */
    coachVoiceCeiling: CoachVoiceLevel
    /** Force-enable early-answer once a user is fluent or above,
     *  regardless of mode (still respects the mode's `silent`
     *  coach voice). */
    forceEarlyAnswer: boolean
  }
> = {
  first_exposure: {
    scanTargetCount: 2,
    coachVoiceCeiling: 'explicit',
    forceEarlyAnswer: false,
  },
  recognizing: {
    scanTargetCount: 1,
    coachVoiceCeiling: 'guided',
    forceEarlyAnswer: false,
  },
  fluent: {
    scanTargetCount: 0,
    coachVoiceCeiling: 'minimal',
    forceEarlyAnswer: true,
  },
  mastered: {
    scanTargetCount: 0,
    coachVoiceCeiling: 'silent',
    forceEarlyAnswer: true,
  },
}

const COACH_VOICE_RANK: Record<CoachVoiceLevel, number> = {
  explicit: 3,
  guided: 2,
  minimal: 1,
  silent: 0,
}

function lowerCoachVoice(a: CoachVoiceLevel, b: CoachVoiceLevel): CoachVoiceLevel {
  return COACH_VOICE_RANK[a] <= COACH_VOICE_RANK[b] ? a : b
}

// --- public API ------------------------------------------------------------

export interface CoachingConfigInput {
  decoder: DecoderTag | undefined
  trainingMode: PathwayTrainingMode | undefined
  mastery?: MasteryTier
  /** Optional rep count on this scenario, in this session. Used to
   *  drop scan targets after the second correct rep on the same
   *  scenario even if the cross-scenario mastery hasn't risen. */
  scenarioRepCount?: number
}

/**
 * Resolves the film-room coaching config for a player at the start
 * of a rep. Pure: same inputs → same output.
 *
 * Resolution order:
 *   1. Mode base from MODE_BASE (default = SAFE_DEFAULT_CONFIG).
 *   2. Apply mastery override (truncate scan targets, lower coach
 *      voice ceiling, optionally force early-answer).
 *   3. Apply scenarioRepCount override (after rep 2 on the same
 *      scenario, drop the secondary scan target; after rep 3, drop
 *      both).
 *   4. Hydrate decoder-specific scan targets from
 *      DECODER_SCAN_TARGETS, truncated by step 2/3.
 *
 * Never throws. Unknown decoder → empty scan target list, default
 * coach voice text resolution returns null. Unknown trainingMode →
 * SAFE_DEFAULT_CONFIG.
 */
export function getFilmRoomCoachingConfig(
  input: CoachingConfigInput,
): FilmRoomCoachingConfig {
  const { decoder, trainingMode, mastery = DEFAULT_MASTERY, scenarioRepCount = 0 } = input

  const base = trainingMode ? MODE_BASE[trainingMode] : null
  const cfg: FilmRoomCoachingConfig = base
    ? { ...base, scanTargets: [] }
    : { ...SAFE_DEFAULT_CONFIG, scanTargets: [] }

  const ov = MASTERY_OVERRIDES[mastery]
  let scanCount = ov.scanTargetCount

  // Per-scenario rep count further reduces scan targets within a
  // session even when cross-decoder mastery hasn't risen.
  if (scenarioRepCount >= 2) scanCount = Math.min(scanCount, 1)
  if (scenarioRepCount >= 3) scanCount = 0

  cfg.coachVoice = lowerCoachVoice(cfg.coachVoice, ov.coachVoiceCeiling)

  if (ov.forceEarlyAnswer && cfg.coachVoice !== 'silent') {
    cfg.earlyAnswerEnabled = true
  }

  // Hydrate scan targets in mode-base position (we left them empty
  // above so we can apply the count cap deterministically here).
  if (decoder && scanCount > 0) {
    const list = DECODER_SCAN_TARGETS[decoder] ?? []
    cfg.scanTargets = list.slice(0, scanCount)
  } else {
    cfg.scanTargets = []
  }

  return cfg
}

/**
 * Returns true if a tick `t` falls inside the early-answer window
 * (the last `earlyAnswerWindowMs` before `freezeAtMs`). Pure helper
 * the controller calls in its `pickedChoiceId` accept gate.
 */
export function isInEarlyAnswerWindow(
  t: number,
  freezeAtMs: number | undefined,
  config: FilmRoomCoachingConfig,
): boolean {
  if (!config.earlyAnswerEnabled) return false
  if (freezeAtMs === undefined || freezeAtMs < 0) return false
  return t >= freezeAtMs - config.earlyAnswerWindowMs && t < freezeAtMs
}

/**
 * Classifies an answer event at tick `t` into an outcome flag the
 * scoring layer can stamp on the rep. Pure.
 *
 *   `anticipated` = picked correctly inside the early-answer window
 *                   (becomes the bestPlus visual reward).
 *   `at_freeze`   = picked correctly at or after freezeAtMs.
 *   `not_anticipated` = anything else — caller decides best/incorrect
 *                       on their own; this helper only owns the
 *                       anticipation flag.
 */
export function classifyAnswerTiming(args: {
  t: number
  freezeAtMs: number | undefined
  config: FilmRoomCoachingConfig
}): 'anticipated' | 'at_freeze' | 'not_anticipated' {
  if (isInEarlyAnswerWindow(args.t, args.freezeAtMs, args.config)) return 'anticipated'
  if (args.freezeAtMs !== undefined && args.t >= args.freezeAtMs) return 'at_freeze'
  return 'not_anticipated'
}

/** Convenience — returns the coach-voice text for a session, or
 *  null if silent. */
export function getSessionCoachVoiceText(input: CoachingConfigInput): string | null {
  const cfg = getFilmRoomCoachingConfig(input)
  return getCoachVoiceText(input.decoder, cfg.coachVoice)
}

/** Test/debug helper — returns the entire decoder scan-target list
 *  regardless of mastery. The renderer never calls this; tests do. */
export function _decoderScanTargetsForTest(decoder: DecoderTag): ReadonlyArray<ScanTargetTag> {
  return DECODER_SCAN_TARGETS[decoder] ?? []
}
