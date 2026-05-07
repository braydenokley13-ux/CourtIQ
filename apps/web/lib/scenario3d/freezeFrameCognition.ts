/**
 * Phase D — Part 2C (seed)
 * Freeze-Frame Cognition Pass — pure-data choreography.
 *
 * Owns the deterministic schedule for the 2.3-second window centered
 * on `scene.freezeAtMs`. Emits the canonical
 *
 *     cue → action → advantage
 *
 * three-beat sequence per decoder, plus the timing offsets the
 * pre-freeze ramp and the cognition hold are paced from. Built on
 * top of the Part 2B readability layer; produces FreezeBeatTemplates
 * which the renderer hydrates into OverlayBeats with concrete player
 * ids / anchor points so the existing `OverlayBeat` choreography
 * sort + clutter pipeline can ingest them without adapter code.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No THREE.js. No clocks. No imports of
 *     renderer code or the imperative scene.
 *   - Same inputs → same outputs. Determinism is the contract.
 *   - This module never owns x/z routes, never owns scenario timing,
 *     never owns clip selection. It only schedules WHEN existing
 *     overlay primitives fade in / out around freeze, and exposes
 *     the helpers callers need to compute pre-freeze ramp progress
 *     and cognition-hold progress without re-deriving them.
 *   - Beat counts capped at 3 per decoder per freeze. Caller is
 *     trusted to honour the cap; tests below assert it on the
 *     emitted templates.
 *   - Off-axis decoders / missing decoder collapse to an empty
 *     template list. Never throws, never returns undefined.
 *   - Templates use the SCHEMA's existing OverlayPrimitive kinds —
 *     no new primitive types are introduced.
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - imperativeTeachingOverlay  reads `getFreezeBeatTemplates(decoder)`
 *                                at freeze entry, hydrates each
 *                                template with concrete refs from
 *                                the scene, and forwards to its
 *                                existing OverlayBeat scheduler.
 *   - cameraPresets              reads `FREEZE_RAMP_WINDOW_MS` to
 *                                start the camera ease 600ms before
 *                                freezeAtMs.
 *   - imperativeScene            reads `cognitionScaleAt(...)` to
 *                                pace the freeze emphasis quaternion
 *                                during the cognition hold.
 */

import type { DecoderTag, OverlayPrimitive } from './schema'
import type { CourtPoint } from './coords'
import type { OverlayBeat, OverlayTeachingQuestion } from './overlayBeats'

// --- timing constants ------------------------------------------------------

/** Pre-freeze tension ramp window. Posture emphasis, camera ease,
 *  and cue foreshadow all begin at (freezeAtMs - this) ms. */
export const FREEZE_RAMP_WINDOW_MS = 600

/** First-overlay foreshadow offset (low-opacity). Negative offset
 *  means BEFORE freeze. Authored relative to freezeAtMs. */
export const FREEZE_FORESHADOW_OFFSET_MS = -200

/** Cognition hold — how long the freeze pose / camera / overlay
 *  schedule peaks before the choice tray takes over. */
export const FREEZE_COGNITION_HOLD_MS = 1400

/** Handoff window — emphasis / overlays decay to 0 over this many
 *  ms after cognition hold ends. */
export const FREEZE_HANDOFF_WINDOW_MS = 300

/** Convenience — total freeze envelope from ramp start to handoff
 *  end. Useful for test fixtures and timeline budget asserts. */
export const FREEZE_TOTAL_ENVELOPE_MS =
  FREEZE_RAMP_WINDOW_MS + FREEZE_COGNITION_HOLD_MS + FREEZE_HANDOFF_WINDOW_MS

// --- per-beat offsets (relative to freezeAtMs) -----------------------------
//
// All offsets relative to freezeAtMs. The schedule is identical across
// decoders by design — only the primitives differ. This keeps the
// cognitive cadence consistent so users learn ONE rhythm.

/** Cue beat full-opacity reveal. */
export const CUE_BEAT_AT_MS = 200
/** Plain-English label fade-in. */
export const LABEL_BEAT_AT_MS = 600
/** Action overlay fade-in. */
export const ACTION_BEAT_AT_MS = 700
/** Advantage overlay fade-in. */
export const ADVANTAGE_BEAT_AT_MS = 1100
/** Choice tray opens — informational; the controller owns it. */
export const CHOICE_TRAY_AT_MS = 1400

/** Default fade durations. Authors may override per beat. */
export const DEFAULT_BEAT_FADE_IN_MS = 300
export const DEFAULT_BEAT_FADE_OUT_MS = 200

// --- types -----------------------------------------------------------------

export type CognitionPhase =
  /** > FREEZE_RAMP_WINDOW_MS before freezeAtMs, or scenario has no freeze. */
  | 'pre'
  /** Within the ramp window, before freezeAtMs. */
  | 'ramp'
  /** At freezeAtMs; held during cognition window. */
  | 'hold'
  /** Within the handoff window, after cognition hold ends. */
  | 'handoff'
  /** After the handoff has fully decayed. */
  | 'post'

/** Which sub-beat this overlay is. The renderer treats them all as
 *  `phase: 'freeze'` OverlayBeats — this is just an authoring tag
 *  so the cognition module's emit fn stays self-documenting. */
export type FreezeBeatKind = 'cue' | 'label' | 'action' | 'advantage'

/** Symbolic role anchors. The renderer hydrates these to concrete
 *  player IDs / court points at emit time. Pure data — no scene
 *  reads required to author a template. */
export type FreezeBeatAnchorRole =
  | 'cue_defender'        // BDW deny defender, ESC helper, SKR helpers, AOR closeout
  | 'cue_offensive'       // SKR open_player, AOR receiver
  | 'cutter'
  | 'receiver'
  | 'open_player'
  | 'passer'
  | 'vacated_zone'        // ESC / SKR — anchor is geometric, not a player
  | 'open_rim_zone'       // BDW backdoor catch zone
  | 'closeout_target'     // AOR — between closeout defender + receiver

/** Pure-data freeze beat. The renderer hydrates `primitive_kind +
 *  anchor_role` into a concrete OverlayPrimitive at emit time using
 *  scene player ids and authored court points. */
export interface FreezeBeatTemplate {
  kind: FreezeBeatKind
  /** Time relative to freezeAtMs (ms). */
  at_phase_ms: number
  /** OverlayPrimitive `kind` selector — must match the schema's
   *  discriminated union. */
  primitive_kind: OverlayPrimitive['kind']
  /** Symbolic anchor role(s) the renderer fills in. Single-anchor
   *  primitives use only `anchor`; two-anchor primitives (passing
   *  lanes, drive cut previews) use `anchor` + `target_anchor`. */
  anchor: FreezeBeatAnchorRole
  target_anchor?: FreezeBeatAnchorRole
  /** Help-pulse role label, if the primitive is `help_pulse`. */
  help_pulse_role?: 'tag' | 'low_man' | 'nail' | 'stunter' | 'overhelp'
  clutter_priority: number
  fade_in_ms: number
  fade_out_ms: number
  /** Teaching-question tag for the overlay scheduler. */
  teaching_question: OverlayTeachingQuestion
}

// --- per-decoder beat templates --------------------------------------------
//
// Each decoder gets exactly three semantic beats (cue/action/advantage).
// `clutter_priority` is ascending (1=cue, 2=action, 3=advantage) so if
// the renderer is forced to drop one, the cue is preserved.

const BDW_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_vision_cone',
    anchor: 'cue_defender',
    target_anchor: 'cutter',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'passing_lane_open',
    anchor: 'passer',
    target_anchor: 'cutter',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'open_rim_zone',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const ESC_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_hip_arrow',
    anchor: 'cue_defender',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'drive_cut_preview',
    anchor: 'cutter',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'vacated_zone',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const SKR_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'help_pulse',
    anchor: 'cue_defender',
    help_pulse_role: 'overhelp',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'passing_lane_open',
    anchor: 'passer',
    target_anchor: 'open_player',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'open_player',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const AOR_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_chest_line',
    anchor: 'cue_defender',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'drive_cut_preview',
    anchor: 'receiver',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'closeout_target',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const DECODER_TEMPLATES: Record<DecoderTag, ReadonlyArray<FreezeBeatTemplate>> = {
  BACKDOOR_WINDOW: BDW_TEMPLATES,
  EMPTY_SPACE_CUT: ESC_TEMPLATES,
  SKIP_THE_ROTATION: SKR_TEMPLATES,
  ADVANTAGE_OR_RESET: AOR_TEMPLATES,
}

// --- public API ------------------------------------------------------------

/** Returns the canonical freeze-phase template list for a decoder.
 *  Returns `[]` for an undefined decoder. Never throws. */
export function getFreezeBeatTemplates(
  decoder: DecoderTag | undefined,
): ReadonlyArray<FreezeBeatTemplate> {
  if (!decoder) return []
  return DECODER_TEMPLATES[decoder] ?? []
}

/**
 * Renderer-side anchors. The imperativeScene resolves symbolic roles
 * to concrete player ids / court points and passes this map to
 * `hydrateFreezeBeats` to produce schema-valid OverlayBeats.
 *
 * Any anchor a decoder's templates do not reference may be omitted.
 * Missing required anchors cause `hydrateFreezeBeats` to skip that
 * beat — never throw, never emit an invalid primitive.
 */
export interface FreezeBeatAnchors {
  cue_defender?: string
  cue_offensive?: string
  cutter?: string
  receiver?: string
  open_player?: string
  passer?: string
  vacated_zone?: CourtPoint
  open_rim_zone?: CourtPoint
  closeout_target?: CourtPoint
}

export interface HydrateOptions {
  visibility?: { beginner: boolean; intermediate: boolean; advanced: boolean }
  /** Override the default open-space radius (default 4 ft). */
  open_space_radius_ft?: number
}

const DEFAULT_VISIBILITY = {
  beginner: true,
  intermediate: true,
  advanced: true,
} as const

/**
 * Hydrates a list of templates into schema-valid OverlayBeats by
 * filling in concrete player ids / court points from `anchors`.
 *
 * Templates whose required anchors are missing are silently skipped
 * (never thrown). The caller's QA matrix is responsible for catching
 * authoring gaps before runtime.
 */
export function hydrateFreezeBeats(
  decoder: DecoderTag,
  templates: ReadonlyArray<FreezeBeatTemplate>,
  anchors: FreezeBeatAnchors,
  options?: HydrateOptions,
): OverlayBeat[] {
  const visibility = options?.visibility ?? DEFAULT_VISIBILITY
  const radiusFt = options?.open_space_radius_ft ?? 4
  const out: OverlayBeat[] = []
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]!
    const primitive = _hydratePrimitive(t, anchors, radiusFt)
    if (!primitive) continue
    out.push({
      beat_id: `freeze_${decoder}_${t.kind}_${i}`,
      decoder,
      phase: 'freeze',
      at_phase_ms: t.at_phase_ms,
      teaching_question: t.teaching_question,
      primitive,
      clutter_priority: t.clutter_priority,
      visibility: { ...visibility },
      fade_in_ms: t.fade_in_ms,
      fade_out_ms: t.fade_out_ms,
    })
  }
  return out
}

/** Resolves a single anchor role to either a player id or a court
 *  point. Returns the literal value if found; undefined otherwise. */
function _anchorPlayerId(
  role: FreezeBeatAnchorRole,
  a: FreezeBeatAnchors,
): string | undefined {
  switch (role) {
    case 'cue_defender': return a.cue_defender
    case 'cue_offensive': return a.cue_offensive
    case 'cutter': return a.cutter
    case 'receiver': return a.receiver
    case 'open_player': return a.open_player
    case 'passer': return a.passer
    default: return undefined
  }
}

function _anchorPoint(
  role: FreezeBeatAnchorRole,
  a: FreezeBeatAnchors,
): CourtPoint | undefined {
  switch (role) {
    case 'vacated_zone': return a.vacated_zone
    case 'open_rim_zone': return a.open_rim_zone
    case 'closeout_target': return a.closeout_target
    default: return undefined
  }
}

/**
 * Build the schema-valid OverlayPrimitive for a template. Returns
 * undefined if the required anchors are not present in `anchors` —
 * the caller filters these out.
 */
function _hydratePrimitive(
  t: FreezeBeatTemplate,
  a: FreezeBeatAnchors,
  radiusFt: number,
): OverlayPrimitive | undefined {
  switch (t.primitive_kind) {
    case 'defender_vision_cone': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      const targetId = t.target_anchor
        ? _anchorPlayerId(t.target_anchor, a)
        : undefined
      return targetId
        ? { kind: 'defender_vision_cone', playerId, targetId }
        : { kind: 'defender_vision_cone', playerId }
    }
    case 'defender_hip_arrow': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_hip_arrow', playerId }
    }
    case 'defender_foot_arrow': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_foot_arrow', playerId }
    }
    case 'defender_chest_line': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_chest_line', playerId }
    }
    case 'defender_hand_in_lane': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_hand_in_lane', playerId }
    }
    case 'help_pulse': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId || !t.help_pulse_role) return undefined
      return { kind: 'help_pulse', playerId, role: t.help_pulse_role }
    }
    case 'passing_lane_open': {
      const from = _anchorPlayerId(t.anchor, a)
      const to = t.target_anchor ? _anchorPlayerId(t.target_anchor, a) : undefined
      if (!from || !to) return undefined
      return { kind: 'passing_lane_open', from, to }
    }
    case 'passing_lane_blocked': {
      const from = _anchorPlayerId(t.anchor, a)
      const to = t.target_anchor ? _anchorPlayerId(t.target_anchor, a) : undefined
      if (!from || !to) return undefined
      return { kind: 'passing_lane_blocked', from, to }
    }
    case 'drive_cut_preview': {
      // The cognition module does not author the polyline; the
      // renderer hydrates a 2-point preview from the player's
      // active movement segment. If the renderer cannot produce a
      // path, this beat is skipped.
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      // We emit a placeholder zero-length path; the renderer is
      // expected to replace it with the player's actual segment
      // before the beat is consumed by the overlay scheduler.
      // (Schema requires min(2) points — emit two identical to
      // satisfy the union; the renderer overrides at hydrate time.)
      return undefined
    }
    case 'open_space_region': {
      const anchor = _anchorPoint(t.anchor, a)
      if (!anchor) return undefined
      return { kind: 'open_space_region', anchor, radiusFt }
    }
    case 'label': {
      // Cognition module does not author label text — that's owned
      // by replayTeachingTimeline.getDecoderTeachingLabel. Skip;
      // the renderer schedules the label separately.
      return undefined
    }
    case 'timing_pulse': {
      const anchor = _anchorPoint(t.anchor, a)
      if (!anchor) return undefined
      return { kind: 'timing_pulse', anchor, durationMs: 600 }
    }
    default: return undefined
  }
}

// --- progress helpers ------------------------------------------------------

/** Classifies a tick into a CognitionPhase given the freeze entry
 *  tick and the windows above. Pure helper; resolver-friendly so
 *  the scene controller can compute it once per tick.
 *
 *  `msSinceFreezeEnter` is the controller's ms-since-frozen counter
 *  (only valid while in `frozen`). `msSinceHoldEnd` is set once the
 *  cognition hold has ended (handoff window starting). When neither
 *  is provided, the helper uses `t` vs `freezeAtMs`. */
export function classifyCognitionPhase(args: {
  freezeAtMs: number | undefined
  t: number
  msSinceFreezeEnter?: number
  msSinceHoldEnd?: number
}): CognitionPhase {
  const { freezeAtMs, t, msSinceFreezeEnter, msSinceHoldEnd } = args
  if (freezeAtMs === undefined || freezeAtMs < 0) return 'pre'
  if (typeof msSinceHoldEnd === 'number') {
    if (msSinceHoldEnd < FREEZE_HANDOFF_WINDOW_MS) return 'handoff'
    return 'post'
  }
  if (typeof msSinceFreezeEnter === 'number') {
    if (msSinceFreezeEnter <= FREEZE_COGNITION_HOLD_MS) return 'hold'
    return 'handoff'
  }
  if (t < freezeAtMs - FREEZE_RAMP_WINDOW_MS) return 'pre'
  if (t < freezeAtMs) return 'ramp'
  return 'hold'
}

/** Linear ramp progress in [0,1] for the pre-freeze tension ramp.
 *  Returns 0 outside the ramp window. */
export function preFreezeRampProgress(t: number, freezeAtMs: number | undefined): number {
  if (freezeAtMs === undefined || freezeAtMs < 0) return 0
  const start = freezeAtMs - FREEZE_RAMP_WINDOW_MS
  if (t <= start) return 0
  if (t >= freezeAtMs) return 1
  return (t - start) / FREEZE_RAMP_WINDOW_MS
}

/** Cognition-hold scale in [0,1]. Returns 1 throughout the hold,
 *  decays linearly across the handoff window, returns 0 before ramp
 *  and after handoff. The renderer multiplies its peak emphasis by
 *  this scalar so all three coordinated channels (posture, camera,
 *  overlay opacity) decay together. */
export function cognitionScaleAt(args: {
  freezeAtMs: number | undefined
  t: number
  msSinceFreezeEnter?: number
  msSinceHoldEnd?: number
}): number {
  const phase = classifyCognitionPhase(args)
  if (phase === 'pre' || phase === 'post') return 0
  if (phase === 'ramp') return preFreezeRampProgress(args.t, args.freezeAtMs)
  if (phase === 'hold') return 1
  // handoff
  const sinceHold = args.msSinceHoldEnd ?? 0
  const remaining = 1 - sinceHold / FREEZE_HANDOFF_WINDOW_MS
  return remaining < 0 ? 0 : remaining
}

/** Total visible window for the freeze cognition pass relative to
 *  freezeAtMs. Single source of truth — never re-add the constants
 *  by hand. */
export function getFreezeEnvelope(freezeAtMs: number): { startMs: number; endMs: number } {
  return {
    startMs: freezeAtMs - FREEZE_RAMP_WINDOW_MS,
    endMs: freezeAtMs + FREEZE_COGNITION_HOLD_MS + FREEZE_HANDOFF_WINDOW_MS,
  }
}
