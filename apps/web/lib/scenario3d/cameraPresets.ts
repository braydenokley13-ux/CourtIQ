/**
 * FR-4 — Decoder-Aware Camera Presets.
 *
 * Defines the four named teaching-camera presets the planning doc
 * §8.2 names — `teaching-angle`, `player-read-angle`,
 * `help-defense-angle`, `top-down-coach-board` — plus the
 * decoder + phase + cameraAssist dispatcher that picks one of them
 * (or falls back to the existing `broadcast` / `auto` modes) for
 * any given scene.
 *
 * Architecture choice: this module is the *policy* layer. The
 * actual camera placement still ships through
 * `imperativeScene.computeCameraTarget`, which extends its switch
 * with the new mode names. The split keeps the existing camera
 * controller, easing, and aspect handling untouched (per the FR-4
 * "do NOT rewrite the renderer" constraint), while letting the
 * decoder/phase decision live in a pure data file the QA route can
 * exercise without mounting a canvas.
 *
 * Contract:
 *   - `pickAssistedCameraMode(...)` returns the mode the dispatcher
 *     wants the controller to be in for the (decoder, phase, assist)
 *     tuple.
 *   - `null` means "no opinion — keep whatever mode the user / URL /
 *     parent already chose." This is the §8.6 manual-override
 *     contract.
 *   - The dispatcher NEVER touches a controller directly. The canvas
 *     still owns the `setMode` call.
 */

import type { DecoderTag } from './schema'
import type { ReplayPhase } from '@/components/scenario3d/ScenarioReplayController'
import type { CameraMode } from '@/components/scenario3d/imperativeScene'

/**
 * §8.9 / FR-4 Packet 4 — how aggressively the renderer should help
 * with the freeze framing. The Pathways layer chooses; the renderer
 * just respects whatever the prop says. Default: `'full'` for
 * `/dev/scenario-preview` so QA sees the assisted framing; `/train`
 * defaults to `'partial'` so existing players are not surprised by
 * a new mid-rep camera lurch.
 */
export type CameraAssist = 'full' | 'partial' | 'none'

/**
 * §8.2 — the four named teaching presets that extend the existing
 * `CameraMode` union. Kept as a separate type alias so a switch can
 * exhaustively pin the FR-4 surface without listing the legacy
 * `auto / broadcast / tactical / follow / replay` modes too.
 *
 * Mode mapping back to the existing controller:
 *   - `teaching-angle`        — composed pitch-down framing around
 *                                the user + key defender (FR-4).
 *   - `player-read-angle`     — over-the-shoulder of the user.
 *   - `help-defense-angle`    — side-on weak-side framing for SKR.
 *   - `top-down-coach-board`  — pure top-down review framing.
 *
 * `top-down-coach-board` is the FR-4 successor to the legacy
 * `tactical` mode: same idea (high pitch), tighter aspect handling.
 * The legacy `tactical` still ships so a deep-link `?camera=tactical`
 * URL keeps working.
 */
export type DecoderCameraPreset =
  | 'teaching-angle'
  | 'player-read-angle'
  | 'help-defense-angle'
  | 'top-down-coach-board'

/** Convenience: every CameraMode the FR-4 dispatcher may emit. */
export type AssistedCameraMode = CameraMode | DecoderCameraPreset

/**
 * Preset selector inputs. Pure data so the dispatcher is unit-
 * testable without mounting any 3D state.
 */
export interface PickAssistedCameraInput {
  decoder: DecoderTag | null | undefined
  phase: ReplayPhase
  assist: CameraAssist
  /** §8.6 — set to true the moment the user touches the dropdown.
   *  When true, the dispatcher returns `null` so the canvas leaves
   *  the controller alone. */
  manualOverride: boolean
}

/**
 * §8.3 / §8.6 — decoder + phase + assist → preset.
 *
 * Returns `null` when the dispatcher has no opinion:
 *   - `manualOverride === true` (user touched the dropdown)
 *   - `assist === 'none'` AND we'd want anything other than broadcast
 *     (pure broadcast keeps `/none` rendering consistent with
 *     pre-FR-4 behaviour)
 *   - the (decoder, phase) pair is not assisted at this assist tier
 *
 * Returning `null` is the contract the canvas relies on to know
 * "leave the controller mode alone." A non-null return means
 * "switch the controller to this mode now."
 */
export function pickAssistedCameraMode(
  input: PickAssistedCameraInput,
): AssistedCameraMode | null {
  const { decoder, phase, assist, manualOverride } = input

  // §8.6 — manual override always wins. The dispatcher offers no
  // opinion; the canvas keeps the user's choice.
  if (manualOverride) return null

  // §8.9 — boss / advanced mode: broadcast everywhere.
  if (assist === 'none') {
    return 'broadcast'
  }

  // No decoder context (legacy / synthetic / preset previews) —
  // fall back to the existing auto-fit camera so the framing tries
  // to keep the action in frame even without a teaching policy.
  if (!decoder) {
    return phase === 'replaying' ? 'replay' : 'auto'
  }

  // §8.3 — phase-aware policy table.
  switch (phase) {
    case 'idle':
    case 'setup':
    case 'playing':
      return 'broadcast'

    case 'frozen': {
      // §8.9 — partial assist keeps broadcast through freeze; only
      // full assist composes the teaching frame.
      if (assist === 'partial') return 'broadcast'
      return freezePresetForDecoder(decoder)
    }

    case 'consequence':
      return replayPresetForDecoder(decoder, assist)

    case 'cueRepaint':
      // V1 stabilization — `cueRepaint` is the short hold between
      // consequence end (or best-read pick) and the answer-leg
      // motion. Returning `null` (hold the previous mode) prevents
      // a frozen → consequence → cueRepaint → replaying camera
      // bounce on the wrong-pick path: the controller stays on
      // the consequence/replay framing instead of snapping back to
      // the freeze preset and then forward again. Best-read picks
      // come straight from `frozen`, so the hold also keeps the
      // freeze framing while the cue cluster repaints.
      return null

    case 'replaying':
      return replayPresetForDecoder(decoder, assist)

    case 'done':
    default:
      // Hold the last preset by signalling "no opinion" so the
      // controller eases the previous frame to a stop instead of
      // snapping back to broadcast.
      return null
  }
}

/**
 * §8.3 — freeze-phase preset by decoder.
 *
 * Hard-coded table; do not extend at call sites. New decoders must
 * land alongside an explicit decision here so the QA route catches
 * a missing entry instead of silently falling back to broadcast.
 */
function freezePresetForDecoder(decoder: DecoderTag): DecoderCameraPreset {
  switch (decoder) {
    case 'BACKDOOR_WINDOW':
      return 'teaching-angle'
    case 'EMPTY_SPACE_CUT':
      return 'teaching-angle'
    case 'ADVANTAGE_OR_RESET':
      return 'teaching-angle'
    case 'SKIP_THE_ROTATION':
      // §8.3 — SKR's freeze frame *is* the help-defense angle so the
      // over-helper and the abandoned weak-side shooter live in the
      // same shot.
      return 'help-defense-angle'
    case 'READ_THE_COVERAGE':
      // DROP — the chest-line + pocket read needs the screener and
      // ball-handler in the same plane; top-down keeps the screen
      // geometry uncluttered. Matches decoderCameraPresets.ts §1.
      return 'top-down-coach-board'
    case 'HUNT_THE_ADVANTAGE':
      // HUNT — first-beat matchup recognition uses the teaching angle
      // so the mismatched body is visible from the wing's frame of
      // reference, parallel to BDW/ESC/AOR.
      return 'teaching-angle'
  }
}

/**
 * §8.3 — replay-phase preset by decoder. `partial` assist still
 * gets a teaching replay (the freeze stayed broadcast, but the
 * post-decision angle is where the teaching lands).
 */
function replayPresetForDecoder(
  decoder: DecoderTag,
  assist: CameraAssist,
): AssistedCameraMode {
  // `none` was handled at the top of `pickAssistedCameraMode`; this
  // path only ever sees full or partial.
  void assist
  switch (decoder) {
    case 'BACKDOOR_WINDOW':
      return 'player-read-angle'
    case 'EMPTY_SPACE_CUT':
      return 'player-read-angle'
    case 'ADVANTAGE_OR_RESET':
      return 'player-read-angle'
    case 'SKIP_THE_ROTATION':
      return 'top-down-coach-board'
    case 'READ_THE_COVERAGE':
      // DROP — replay stays on the coach-board view so the pocket
      // pull-up or snake path reads cleanly against the screen
      // geometry, matching the freeze preset.
      return 'top-down-coach-board'
    case 'HUNT_THE_ADVANTAGE':
      // HUNT — second-beat exploit lives on the player-read angle
      // (same as BDW/ESC/AOR) so the mismatch attack against the
      // recovery foot reads from the wing's perspective.
      return 'player-read-angle'
  }
}

/**
 * §8.7 — phone aspect adjustments. Returned as multipliers/deltas
 * the placement code applies on top of the canonical desktop
 * geometry so the same preset frames cleanly on a 393 px landscape
 * canvas. Pure function — caller picks an aspect, dispatcher
 * returns the deltas.
 *
 * Heuristic per the planning doc:
 *   - portrait phone (aspect < 0.7): tighten pitch by ~5°, dolly
 *     in 10% so the help-defense angle does not show wasted sky.
 *   - landscape phone (0.7 <= aspect < 1.5): no pitch tweak, but
 *     dolly in 5%.
 *   - desktop / wide (aspect >= 1.5): no adjustment.
 *
 * `top-down-coach-board` ignores the pitch/dolly inputs (it stays
 * pure top-down) but its FOV widens slightly on portrait so the
 * weak-side shooter stays in frame.
 */
export interface MobileAspectAdjustment {
  /** Multiplier on the camera→target distance. < 1 dollies in. */
  distanceScale: number
  /** Additive degrees on the preset's nominal pitch. */
  pitchDeltaDeg: number
  /** Additive FOV degrees applied to the preset's base FOV. */
  fovDeltaDeg: number
}

export const DESKTOP_ASPECT_ADJUSTMENT: MobileAspectAdjustment = {
  distanceScale: 1,
  pitchDeltaDeg: 0,
  fovDeltaDeg: 0,
}

export function aspectAdjustmentForCanvas(
  aspect: number,
  preset: AssistedCameraMode,
): MobileAspectAdjustment {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return DESKTOP_ASPECT_ADJUSTMENT
  }

  // Top-down: aspect-tolerant by construction, but a portrait phone
  // crops the half-court horizontally — widen FOV a touch so the
  // weak-side shooter still fits.
  if (preset === 'top-down-coach-board') {
    if (aspect < 0.7) {
      return { distanceScale: 1, pitchDeltaDeg: 0, fovDeltaDeg: 6 }
    }
    return DESKTOP_ASPECT_ADJUSTMENT
  }

  if (aspect < 0.7) {
    // Portrait phone — tighten pitch + dolly in.
    return { distanceScale: 0.9, pitchDeltaDeg: -5, fovDeltaDeg: 0 }
  }
  if (aspect < 1.5) {
    // Landscape phone / square-ish — small dolly-in only.
    return { distanceScale: 0.95, pitchDeltaDeg: 0, fovDeltaDeg: 0 }
  }
  return DESKTOP_ASPECT_ADJUSTMENT
}
