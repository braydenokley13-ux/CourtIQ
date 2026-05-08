/**
 * Phase 3.1.3 — Per-decoder camera preset map.
 *
 * The scenario `scene.camera` field accepts one of four preset names
 * (`teaching_angle`, `defense`, `top_down`, `passer_side_three_quarter`
 *  — see `apps/web/lib/scenario3d/schema.ts`). Each decoder family has
 * a canonical preset that reads the cue cluster best:
 *
 *   - BDW (BACKDOOR_WINDOW)         → passer_side_three_quarter
 *     The cue is body-language on the deny defender; passer-side
 *     reads it best.
 *   - ESC (EMPTY_SPACE_CUT)         → teaching_angle
 *     Vacated paint must be visible.
 *   - SKR (SKIP_THE_ROTATION)       → top_down
 *     Whole floor matters; the skip arc must read clearly.
 *   - AOR (ADVANTAGE_OR_RESET)      → defense
 *     Closeout body language is the cue.
 *   - DROP (READ_THE_COVERAGE)      → top_down
 *     Coverage call is read off two defenders' positions; bird's-eye
 *     framing makes the screen-defender depth legible.
 *   - HUNT (HUNT_THE_ADVANTAGE)     → teaching_angle (first beat)
 *                                     passer_side_three_quarter (second)
 *     The two beats use different cameras — first beat shows the
 *     drive→help shape; second beat shows the kick recipient reading
 *     the closeout.
 *
 * Architecture lock (read once, never violate):
 *   - Pure data. No THREE.js, no clocks, no scene reads.
 *   - Same inputs always produce the same outputs.
 *   - The map describes the AUTHORING DEFAULT — not the only
 *     allowed value. A template may override its `scene.camera`
 *     when the decoder's default preset cannot frame a particular
 *     scenario; the override path is allowed but must be justified
 *     in `tactical.notes` (template-side comment).
 *   - The runtime check (Phase 3.1.2 sibling) reads this map to
 *     surface a lint diff if a template's `scene.camera` differs
 *     from the decoder default without an explicit override flag.
 */

import type { DecoderTag } from './schema'

/** Camera preset names — must match `sceneSchema.camera` enum. */
export type SceneCameraPreset =
  | 'teaching_angle'
  | 'defense'
  | 'top_down'
  | 'passer_side_three_quarter'

/** Per-decoder camera spec. Single-beat decoders use only `firstBeat`;
 *  HUNT uses both `firstBeat` and `secondBeat` (when `scene.beatSpec`
 *  is authored). The renderer falls back to `firstBeat` when no second
 *  beat is present. */
export interface DecoderCameraPreset {
  decoder: DecoderTag
  firstBeat: SceneCameraPreset
  secondBeat?: SceneCameraPreset
}

const BDW: DecoderCameraPreset = {
  decoder: 'BACKDOOR_WINDOW',
  firstBeat: 'passer_side_three_quarter',
}

const ESC: DecoderCameraPreset = {
  decoder: 'EMPTY_SPACE_CUT',
  firstBeat: 'teaching_angle',
}

const SKR: DecoderCameraPreset = {
  decoder: 'SKIP_THE_ROTATION',
  firstBeat: 'top_down',
}

const AOR: DecoderCameraPreset = {
  decoder: 'ADVANTAGE_OR_RESET',
  firstBeat: 'defense',
}

const DROP: DecoderCameraPreset = {
  decoder: 'READ_THE_COVERAGE',
  firstBeat: 'top_down',
}

const HUNT: DecoderCameraPreset = {
  decoder: 'HUNT_THE_ADVANTAGE',
  firstBeat: 'teaching_angle',
  secondBeat: 'passer_side_three_quarter',
}

/** Per-decoder camera preset map. Frozen at module load. */
export const DECODER_CAMERA_PRESETS: Readonly<
  Record<DecoderTag, DecoderCameraPreset>
> = Object.freeze({
  BACKDOOR_WINDOW: BDW,
  EMPTY_SPACE_CUT: ESC,
  SKIP_THE_ROTATION: SKR,
  ADVANTAGE_OR_RESET: AOR,
  READ_THE_COVERAGE: DROP,
  HUNT_THE_ADVANTAGE: HUNT,
})

/** Convenience accessor — clean fallback for unknown decoders. */
export function getDecoderCameraPreset(
  decoder: DecoderTag,
): DecoderCameraPreset {
  return DECODER_CAMERA_PRESETS[decoder]
}

/**
 * Returns true when the authored camera matches the decoder's first-
 * beat preset. Used by template lint to surface drift WITHOUT
 * blocking: an author may legitimately override the preset when their
 * scenario's framing requirements diverge (e.g. a HUNT template that
 * only ships one beat may keep the SKR top-down). The lint message
 * names the expected preset so the author can either accept the diff
 * or revert.
 */
export function cameraMatchesDecoderPreset(
  decoder: DecoderTag,
  authoredCamera: SceneCameraPreset,
): boolean {
  return DECODER_CAMERA_PRESETS[decoder].firstBeat === authoredCamera
}
