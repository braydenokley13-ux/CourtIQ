/**
 * Phase D — Part 2B (seed)
 * Decoder Readability Layer — pure-data emphasis profile.
 *
 * Maps (decoder, role, tensionPhase) → a small set of deterministic
 * scalars that EXISTING write surfaces (applyAthleticLean,
 * applyPlayerYaw, applyFreezeEmphasis, cameraPresets, overlayBeats)
 * read at tick time to make tactical body language legible.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No THREE.js. No imports of renderer code.
 *   - Same inputs → same outputs. Determinism is a hard contract.
 *   - This module never owns x/z routes, never owns scenario timing,
 *     never owns clip selection. It only modulates the magnitude
 *     and direction of pose adjustments other modules already make.
 *   - Off-axis combinations (decoder × role pairs not central to the
 *     decoder) MUST return NEUTRAL_PROFILE — never throw, never
 *     return undefined. The cue figure is the only emphasized figure.
 *   - Hard caps in EMPHASIS_CAPS are non-negotiable. Above those
 *     the figure stops looking like a basketball player.
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - applyAthleticLean         reads `leanBoost`
 *   - applyPlayerYaw            reads `headTurnBoostRad`, `hipYawBoostRad`
 *   - applyFreezeEmphasis (NEW) reads `freezeEmphasisRad` per bone group
 *   - cameraPresets             reads `cameraBias`
 *   - overlayBeats              reads `overlayBeatBias`
 */

import type { DecoderRole } from './animationIntent'
import type { DecoderTag } from './schema'

// --- types -----------------------------------------------------------------

/**
 * Where in the freeze build-up we are. Computed once per tick by the
 * caller from `(t, freezeAtMs)` and passed in. Pure-fn output below
 * depends on it, but the phase classification itself is the caller's
 * job so this module stays clock-free.
 *
 *   `pre`     — anywhere before the 600ms ramp window.
 *   `ramp`    — last 600ms before freezeAtMs. Emphasis grows linearly.
 *   `freeze`  — at freezeAtMs (held).
 *   `release` — first 200ms after freeze ends. Emphasis returns to 0.
 *   `post`    — anywhere else (consequence / replay legs).
 */
export type TensionPhase = 'pre' | 'ramp' | 'freeze' | 'release' | 'post'

/** Defensive body-language states. See Part-2B § 2.
 *
 * Pack 2 (Phase δ) — DROP family adds a sit-back / tag-recover vocabulary
 * that the founder set could not express. The existing OVER_COMMITTED
 * names overhelp (hips already through the ball-line); a DROP big who is
 * still settled below the screen is not over-committed, he is sitting
 * back inside his coverage call. Same shape for the low-man tag: a tag
 * that is "still bumping" lives somewhere between LEVERAGE_HELD and
 * LATE_ROTATION but is neither — it is a half-step commit that recovers
 * before the corner skip arrives. These states name those poses so the
 * readability tables can encode them without overloading the founder
 * vocabulary.
 *
 *   DROP_SIT_BACK         — screen defender held in textbook drop:
 *                            chest below screen, feet to own rim,
 *                            weight back. The cue that says "pocket
 *                            is yours."
 *   DROP_SAGGED           — screen defender deeper than textbook drop:
 *                            chest below the elbow, feet at the lane.
 *                            The cue that says "middle is yours behind
 *                            him." DROP-02's load-bearing pose.
 *   TAG_COMMITTING        — weak-side low man stepped fully into the
 *                            tag line: chest square to roller, both
 *                            feet inside the lane, hips no longer
 *                            shading the corner. The cue that says
 *                            "his corner is open — kick it."
 *   TAG_BUMPING           — weak-side low man stunted at the tag
 *                            line: one foot in the lane, the other
 *                            shading the corner, chest still angled
 *                            outside. He will recover before the kick
 *                            lands. The cue that says "the pocket
 *                            pass to the roller wins."
 *   TAG_RECOVERING        — weak-side low man already retreating from
 *                            a stunt: hips turning back to the corner,
 *                            lead foot pulling out of the lane. The
 *                            post-bump cue that confirms the corner
 *                            kick window is closing.
 */
export type DefensiveBodyState =
  | 'LEVERAGE_HELD'
  | 'BALL_WATCHING'
  | 'OVER_COMMITTED'
  | 'PANIC_RECOVERING'
  | 'CLOSEOUT_BALANCED'
  | 'CLOSEOUT_OFFBALANCE'
  | 'LATE_ROTATION'
  | 'DROP_SIT_BACK'
  | 'DROP_SAGGED'
  | 'TAG_COMMITTING'
  | 'TAG_BUMPING'
  | 'TAG_RECOVERING'

/** Offensive body-language states. See Part-2B § 2.
 *
 * Pack 2 (Phase δ) — DROP family adds two on-ball PnR poses the founder
 * set never described. The ball-handler reading drop coverage is in a
 * distinct pose from a wing receiver loading a catch: hands at the gather,
 * eyes on the screen defender's chest, hips squared to the screen. Same
 * story for the roller diving into the pocket — the "ROLLER_PRESENT"
 * pose is the body-state the pocket pass keys off.
 *
 *   PNR_READ_POCKET       — ball-handler off the screen, gathered into
 *                            the pull-up pocket, eyes on the screen
 *                            defender's chest. The DROP D1 user pose.
 *   ROLLER_PRESENT        — screener rolling hard into the lane with
 *                            hands up: the pocket-pass cue when the
 *                            tag is just bumping.
 */
export type OffensiveBodyState =
  | 'READY_NEUTRAL'
  | 'LOADED_TO_CATCH'
  | 'LEVERAGE_FOUND'
  | 'EXPLOSIVE_BURST'
  | 'SHOT_READY'
  | 'ADVANTAGE_HELD'
  | 'PNR_READ_POCKET'
  | 'ROLLER_PRESENT'

export type BodyState = DefensiveBodyState | OffensiveBodyState

/** Which existing camera preset bucket this profile prefers. The
 *  resolver in cameraPresets.ts treats this as a hint, not a command. */
export type CameraBias =
  | 'teaching-angle'
  | 'player-read-angle'
  | 'help-defense-angle'
  | 'top-down-coach-board'
  | 'none'

/** Which overlay beat the readability profile foreshadows. Consumed
 *  by overlayBeats.ts during the ramp window. */
export type OverlayBeatBias = 'cue' | 'action' | 'advantage' | 'none'

/**
 * Output of the readability profile. All angle scalars are RADIANS
 * and all are ≤ EMPHASIS_CAPS. Caller is responsible for sign +
 * direction relative to the cue (e.g. "head turns AWAY from cutter"
 * — this module reports the magnitude; the renderer applies it
 * relative to ball / man / cutter geometry the renderer already
 * has in hand).
 */
export interface ReadabilityProfile {
  /** Semantic body-language state. The label that explains the rest. */
  bodyState: BodyState
  /** Multiplicative scalar applied to applyAthleticLean's leanPeak.
   *  1.0 = unchanged. Range [0, 1.6]. */
  leanBoost: number
  /** Additive head-yaw bias on the cue figure. Range [0, 0.21] rad
   *  (12° hard cap, 6° soft target). */
  headTurnBoostRad: number
  /** Additive hip-yaw bias relative to the feet. Range [0, 0.18] rad
   *  (10° hard cap, 5° soft target). Today only the head bone is
   *  driven by yaw; reserved for when hip-only yaw lands. */
  hipYawBoostRad: number
  /** Additive emphasis quaternion magnitude applied at freeze on the
   *  cue bone group (head+hips for defenders; lead-foot+shoulder for
   *  offense). Range [0, 0.14] rad (8° cap, 6° soft). */
  freezeEmphasisRad: number
  /** Camera preset preference. */
  cameraBias: CameraBias
  /** Overlay beat preference during the ramp window. */
  overlayBeatBias: OverlayBeatBias
}

// --- caps ------------------------------------------------------------------

/** Hard ceilings. Crossing any of these makes the figure look broken
 *  per Part-2B § 12. The lookup tables below all fit inside these. */
export const EMPHASIS_CAPS = {
  leanBoostMax: 1.6,
  headTurnBoostRadMax: (12 * Math.PI) / 180,
  hipYawBoostRadMax: (10 * Math.PI) / 180,
  freezeEmphasisRadMax: (8 * Math.PI) / 180,
} as const

/** The neutral profile. Non-cue roles, off-axis decoder pairs, and
 *  the `pre` / `post` tension phases all collapse to this. */
export const NEUTRAL_PROFILE: ReadabilityProfile = {
  bodyState: 'READY_NEUTRAL',
  leanBoost: 1.0,
  headTurnBoostRad: 0,
  hipYawBoostRad: 0,
  freezeEmphasisRad: 0,
  cameraBias: 'none',
  overlayBeatBias: 'none',
}

// --- per-decoder cue tables ------------------------------------------------
//
// Each entry is the freeze-time peak. Ramp / release scaling happens
// in the resolver below — these tables are the "100%" values.

interface CuePeak {
  bodyState: BodyState
  leanBoost: number
  headTurnBoostRad: number
  hipYawBoostRad: number
  freezeEmphasisRad: number
  cameraBias: CameraBias
  overlayBeatBias: OverlayBeatBias
}

const DEG = (d: number) => (d * Math.PI) / 180

/** BDW — defender's head off the cutter is the cue. */
const BDW_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  deny_defender: {
    bodyState: 'BALL_WATCHING',
    leanBoost: 1.0,
    headTurnBoostRad: DEG(6),
    hipYawBoostRad: DEG(4),
    freezeEmphasisRad: DEG(7),
    cameraBias: 'player-read-angle',
    overlayBeatBias: 'cue',
  },
  cutter: {
    bodyState: 'EXPLOSIVE_BURST',
    leanBoost: 1.3,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(5),
    cameraBias: 'none',
    overlayBeatBias: 'action',
  },
}

/** ESC — helper hips rotated to ball, vacated zone behind. */
const ESC_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  helper_defender: {
    bodyState: 'OVER_COMMITTED',
    leanBoost: 1.1,
    headTurnBoostRad: DEG(5),
    hipYawBoostRad: DEG(8),
    freezeEmphasisRad: DEG(8),
    cameraBias: 'help-defense-angle',
    overlayBeatBias: 'cue',
  },
  cutter: {
    bodyState: 'LEVERAGE_FOUND',
    leanBoost: 1.2,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(5),
    cameraBias: 'none',
    overlayBeatBias: 'action',
  },
  receiver: {
    bodyState: 'LOADED_TO_CATCH',
    leanBoost: 1.0,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(3),
    cameraBias: 'none',
    overlayBeatBias: 'advantage',
  },
}

/** SKR — late-rotation lag is the cue; two defenders pulled, skip target alone. */
const SKR_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  helper_defender: {
    bodyState: 'LATE_ROTATION',
    leanBoost: 1.1,
    headTurnBoostRad: DEG(6),
    hipYawBoostRad: DEG(7),
    freezeEmphasisRad: DEG(7),
    cameraBias: 'top-down-coach-board',
    overlayBeatBias: 'cue',
  },
  closeout_defender: {
    bodyState: 'PANIC_RECOVERING',
    leanBoost: 1.5,
    headTurnBoostRad: DEG(4),
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(6),
    cameraBias: 'none',
    overlayBeatBias: 'cue',
  },
  open_player: {
    bodyState: 'SHOT_READY',
    leanBoost: 1.0,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(4),
    cameraBias: 'none',
    overlayBeatBias: 'advantage',
  },
}

/** AOR — closeout balance at catch is the cue. The fork between
 *  BALANCED and OFFBALANCE is scenario-authored; this table provides
 *  the BALANCED peak. The OFFBALANCE variant is selected by the
 *  caller via `getReadabilityProfileWithVariant` below. */
const AOR_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  closeout_defender: {
    bodyState: 'CLOSEOUT_BALANCED',
    leanBoost: 1.2,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(5),
    cameraBias: 'player-read-angle',
    overlayBeatBias: 'cue',
  },
  receiver: {
    bodyState: 'LOADED_TO_CATCH',
    leanBoost: 1.0,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(4),
    cameraBias: 'none',
    overlayBeatBias: 'advantage',
  },
}

/** AOR variant when the scenario authors a bad closeout. */
const AOR_OFFBALANCE_CLOSEOUT: CuePeak = {
  bodyState: 'CLOSEOUT_OFFBALANCE',
  leanBoost: 1.5,
  headTurnBoostRad: 0,
  hipYawBoostRad: 0,
  freezeEmphasisRad: DEG(7),
  cameraBias: 'player-read-angle',
  overlayBeatBias: 'cue',
}

// Pack 2 (Phase γ) — HUNT readability table. Mirrors the SKR shape
// (the closest single-read analog) because HUNT D1/D2 reuse the same
// body-language vocabulary on the post-switch defender —
// closeout-recovering hips, late-rotation lean — they're chained in
// time rather than novel in form. The user's read profile lands on
// `receiver` (post-catch read pose) at the second-beat freeze, so
// that role gets the same shot-ready / loaded-to-catch peaks AOR/SKR
// already author. DROP remains empty (single-freeze, screen-defender-
// specific peaks land in a follow-on slice).
const HUNT_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  closeout_defender: {
    bodyState: 'PANIC_RECOVERING',
    leanBoost: 1.5,
    headTurnBoostRad: DEG(4),
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(6),
    cameraBias: 'player-read-angle',
    overlayBeatBias: 'cue',
  },
  helper_defender: {
    bodyState: 'LATE_ROTATION',
    leanBoost: 1.1,
    headTurnBoostRad: DEG(6),
    hipYawBoostRad: DEG(7),
    freezeEmphasisRad: DEG(7),
    cameraBias: 'top-down-coach-board',
    overlayBeatBias: 'cue',
  },
  receiver: {
    bodyState: 'LOADED_TO_CATCH',
    leanBoost: 1.0,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(4),
    cameraBias: 'none',
    overlayBeatBias: 'advantage',
  },
}

// Pack 2 (Phase δ) — DROP readability table. The DROP family freezes on
// the screen defender's coverage shape (D1/D2 cue) and, at D3, on the
// weak-side low man's tag commitment (the second-cue cluster). The
// DecoderRole vocabulary is fixed (Pack 1 enum) — DROP role substrings
// like `screen_defender`, `ball_handler`, and `low_man_*` resolve in the
// scene's player role strings but do not surface as DecoderRole entries.
// The table here keys the cue peaks against the closest DecoderRole
// proxies:
//
//   - `closeout_defender` carries the SCREEN defender's drop / sag
//     pose. We re-use the slot because the renderer's readability
//     resolver receives the same per-player role hand-off that
//     `decoderPrimitives.ts` uses to drive intent dispatch; the DROP
//     screen defender's nearest DecoderRole match is closeout_defender
//     (the only Pack 1 defensive role that names a single on-ball
//     read pose, which DROP's sit-back analogously occupies).
//   - `helper_defender` carries the LOW MAN tag pose at D3 — same
//     slot used by SKR / HUNT for weak-side helpers.
//   - `receiver` carries the ball-handler's PnR read pose (PNR_READ_POCKET).
//     DROP's `ball_handler` is on-ball, not catching, but the receiver
//     slot is the closest "loaded-and-reading" offensive pose Pack 1
//     authors; the renderer's role-resolution stage maps both to the
//     same `LOADED_TO_CATCH` / `PNR_READ_POCKET` family at freeze time.
//   - `open_player` carries the ROLLER_PRESENT pose for the screener
//     rolling into the pocket. The pose's role is the same shape —
//     "ready hands, paint-bound, lane open" — that SKR / AOR's
//     `open_player` already encodes; DROP overloads it for the rolling
//     screener so the renderer can light up the pocket-pass target.
//
// Six entries — one per role × major variant. The peak magnitudes match
// the existing tables (SKR's late-rotation lean, AOR's closeout
// balance) so a renderer that already tuned its emphasis caps does not
// need a re-tune for DROP. The two scenes that need the second variant
// path (D2 sag, D3 tag) opt in via `getReadabilityProfileWithVariant`
// (added below alongside the AOR variant fork).
const DROP_TABLE: Partial<Record<DecoderRole, CuePeak>> = {
  // D1 default — screen defender sitting back in textbook drop.
  closeout_defender: {
    bodyState: 'DROP_SIT_BACK',
    leanBoost: 1.1,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(6),
    cameraBias: 'player-read-angle',
    overlayBeatBias: 'cue',
  },
  // D3 default — weak-side low man bumping the roller. The "committing"
  // variant is selected via getReadabilityProfileWithVariant below.
  helper_defender: {
    bodyState: 'TAG_BUMPING',
    leanBoost: 1.1,
    headTurnBoostRad: DEG(5),
    hipYawBoostRad: DEG(5),
    freezeEmphasisRad: DEG(6),
    cameraBias: 'help-defense-angle',
    overlayBeatBias: 'cue',
  },
  // Ball-handler reading the coverage from the pocket.
  receiver: {
    bodyState: 'PNR_READ_POCKET',
    leanBoost: 1.0,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(4),
    cameraBias: 'none',
    overlayBeatBias: 'action',
  },
  // Screener rolling into the pocket — the pocket-pass target at D3
  // when the tag is just bumping.
  open_player: {
    bodyState: 'ROLLER_PRESENT',
    leanBoost: 1.2,
    headTurnBoostRad: 0,
    hipYawBoostRad: 0,
    freezeEmphasisRad: DEG(4),
    cameraBias: 'none',
    overlayBeatBias: 'advantage',
  },
}

/** DROP — sagged-drop variant (D2 deep-drop pose). Selected via the
 *  scenario data when the screen defender is dropping past the
 *  textbook depth. */
const DROP_SAGGED_SCREEN_DEFENDER: CuePeak = {
  bodyState: 'DROP_SAGGED',
  leanBoost: 1.2,
  headTurnBoostRad: 0,
  hipYawBoostRad: 0,
  freezeEmphasisRad: DEG(7),
  cameraBias: 'player-read-angle',
  overlayBeatBias: 'cue',
}

/** DROP — tag-committing variant (D3 low-man committed to the
 *  roller). Pairs with TAG_BUMPING in the table above; the scenario
 *  data drives the fork the same way AOR's closeout balance fork
 *  does. */
const DROP_COMMITTING_LOW_MAN: CuePeak = {
  bodyState: 'TAG_COMMITTING',
  leanBoost: 1.3,
  headTurnBoostRad: DEG(4),
  hipYawBoostRad: DEG(8),
  freezeEmphasisRad: DEG(7),
  cameraBias: 'help-defense-angle',
  overlayBeatBias: 'cue',
}

const DECODER_TABLES: Record<DecoderTag, Partial<Record<DecoderRole, CuePeak>>> = {
  BACKDOOR_WINDOW: BDW_TABLE,
  EMPTY_SPACE_CUT: ESC_TABLE,
  SKIP_THE_ROTATION: SKR_TABLE,
  ADVANTAGE_OR_RESET: AOR_TABLE,
  READ_THE_COVERAGE: DROP_TABLE,
  HUNT_THE_ADVANTAGE: HUNT_TABLE,
}

// --- resolver --------------------------------------------------------------

/** AOR-only variant tag. Scenario data drives the fork.
 *  `balanced` is the default; `off_balance` opts into the bad-closeout cue. */
export type AorCloseoutVariant = 'balanced' | 'off_balance'

/** DROP-only variant tags. Scenario data drives the fork.
 *
 *   `drop` (default)   — textbook drop, screen defender sitting back at
 *                         the screen level. D1.
 *   `sagged`           — deep drop, screen defender below the elbow. D2.
 *
 *   `bumping` (default) — weak-side low man stunted at the lane line,
 *                         not yet committed. D3 default state — the
 *                         pocket-pass-to-roller cue.
 *   `committing`       — weak-side low man fully into the tag, corner
 *                         abandoned. D3 fork — the corner-skip cue.
 */
export type DropScreenDefenderVariant = 'drop' | 'sagged'
export type DropLowManVariant = 'bumping' | 'committing'

export interface ReadabilityInput {
  decoder: DecoderTag | undefined
  role: DecoderRole | undefined
  tensionPhase: TensionPhase
  /** Required only when (decoder = AOR && role = closeout_defender). Ignored elsewhere. */
  aorCloseoutVariant?: AorCloseoutVariant
  /** Required only when (decoder = DROP && role = closeout_defender). Ignored elsewhere. */
  dropScreenDefenderVariant?: DropScreenDefenderVariant
  /** Required only when (decoder = DROP && role = helper_defender). Ignored elsewhere. */
  dropLowManVariant?: DropLowManVariant
}

/**
 * Returns the readability profile for a player at tick `t`.
 *
 * Resolution order:
 *   1. If decoder or role is missing → NEUTRAL_PROFILE.
 *   2. Look up the (decoder, role) cue peak. If absent → NEUTRAL_PROFILE.
 *   3. AOR + closeout_defender + variant=off_balance → use the
 *      OFFBALANCE peak instead of the table entry.
 *   4. Scale the peak by the tension phase:
 *        pre / post  → all zeros (NEUTRAL_PROFILE shape, but
 *                       bodyState retained so callers can still log it).
 *        ramp        → linearly scaled by the caller's ramp progress.
 *                       This function reports the FULL peak; the caller
 *                       multiplies by progress in [0,1] before applying.
 *                       (Keeps this module clock-free.)
 *        freeze      → full peak.
 *        release     → see ramp; caller multiplies by remaining factor.
 *
 * The function never throws and always returns a defined value.
 */
export function getReadabilityProfile(input: ReadabilityInput): ReadabilityProfile {
  const {
    decoder,
    role,
    tensionPhase,
    aorCloseoutVariant,
    dropScreenDefenderVariant,
    dropLowManVariant,
  } = input
  if (!decoder || !role) return NEUTRAL_PROFILE
  if (tensionPhase === 'pre' || tensionPhase === 'post') return NEUTRAL_PROFILE

  const table = DECODER_TABLES[decoder]
  let peak = table[role]

  if (
    decoder === 'ADVANTAGE_OR_RESET' &&
    role === 'closeout_defender' &&
    aorCloseoutVariant === 'off_balance'
  ) {
    peak = AOR_OFFBALANCE_CLOSEOUT
  }

  if (
    decoder === 'READ_THE_COVERAGE' &&
    role === 'closeout_defender' &&
    dropScreenDefenderVariant === 'sagged'
  ) {
    peak = DROP_SAGGED_SCREEN_DEFENDER
  }

  if (
    decoder === 'READ_THE_COVERAGE' &&
    role === 'helper_defender' &&
    dropLowManVariant === 'committing'
  ) {
    peak = DROP_COMMITTING_LOW_MAN
  }

  if (!peak) return NEUTRAL_PROFILE

  // Defensive cap clamp — keeps the tables honest if a future edit
  // pushes a value above the cap by accident.
  return {
    bodyState: peak.bodyState,
    leanBoost: clamp(peak.leanBoost, 0, EMPHASIS_CAPS.leanBoostMax),
    headTurnBoostRad: clamp(peak.headTurnBoostRad, 0, EMPHASIS_CAPS.headTurnBoostRadMax),
    hipYawBoostRad: clamp(peak.hipYawBoostRad, 0, EMPHASIS_CAPS.hipYawBoostRadMax),
    freezeEmphasisRad: clamp(peak.freezeEmphasisRad, 0, EMPHASIS_CAPS.freezeEmphasisRadMax),
    cameraBias: peak.cameraBias,
    overlayBeatBias: peak.overlayBeatBias,
  }
}

/**
 * Classifies the current tick into a TensionPhase given the freeze
 * tick and the ramp / release windows. Pure helper; the resolver is
 * intentionally clock-free, so this is a separate function.
 *
 *   freezeAtMs       — scenario.freezeAtMs (or undefined → always 'post')
 *   t                — current scenario time in ms
 *   isFrozen         — true while the replay state machine is in 'frozen'
 *   rampWindowMs     — defaults to 600
 *   releaseWindowMs  — defaults to 200
 */
export function classifyTensionPhase(args: {
  freezeAtMs: number | undefined
  t: number
  isFrozen: boolean
  postFreezeMs?: number
  rampWindowMs?: number
  releaseWindowMs?: number
}): TensionPhase {
  const { freezeAtMs, t, isFrozen, postFreezeMs, rampWindowMs = 600, releaseWindowMs = 200 } = args
  if (freezeAtMs === undefined || freezeAtMs < 0) return 'post'
  if (isFrozen) return 'freeze'
  if (t < freezeAtMs - rampWindowMs) return 'pre'
  if (t < freezeAtMs) return 'ramp'
  // freeze just released; check release window
  if (typeof postFreezeMs === 'number' && postFreezeMs <= releaseWindowMs) return 'release'
  return 'post'
}

/**
 * Returns the linear scale [0,1] the caller should multiply the
 * profile's peak values by, given the tension phase and progress
 * within the ramp / release window. The resolver above returns
 * peaks; this function reports how much of the peak is currently
 * "active". Pure helper.
 *
 *   pre / post → 0
 *   freeze     → 1
 *   ramp       → progress in [0,1]   (caller computes 1 - (freezeAtMs - t)/rampWindowMs)
 *   release    → 1 - progress in [0,1]
 */
export function tensionScale(phase: TensionPhase, progress: number): number {
  if (phase === 'freeze') return 1
  if (phase === 'pre' || phase === 'post') return 0
  const p = clamp(progress, 0, 1)
  if (phase === 'ramp') return p
  return 1 - p
}

// --- internals -------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}
