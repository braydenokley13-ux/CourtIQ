/**
 * Scene presets for the launch concept library.
 *
 * Each preset is a builder function that returns a fully-formed Scene3D
 * tailored to its concept. Presets are looked up by `concept_tags`. When a
 * scenario does not author its own `scene` block, `buildScene` consults
 * `getPresetForConcept` to give the scenario a distinct visual instead of
 * falling back to the generic synth.
 */

import type { Scene3D, SceneMovement, ScenePlayer } from './scene'

type PresetBuilder = (id: string) => Scene3D

// --- Helper: build a preset with sensible defaults ------------------------
function preset(
  id: string,
  type: string,
  players: ScenePlayer[],
  ball: Scene3D['ball'],
  movements: SceneMovement[] = [],
  answerDemo: SceneMovement[] = [],
): Scene3D {
  return {
    id,
    type,
    court: 'half',
    camera: 'teaching_angle',
    players,
    ball,
    movements,
    answerDemo,
    freezeAtMs: null,
    synthetic: false,
  }
}

// =========================================================================
// closeouts — user is the perimeter defender closing out on a wing shooter
// after a skip pass.
// =========================================================================
const closeouts: PresetBuilder = (id) =>
  preset(
    id,
    'closeouts',
    [
      { id: 'o_handler', team: 'offense', role: 'ball_handler', label: 'PG', start: { x: -10, z: 24 } },
      { id: 'o_wing', team: 'offense', role: 'strong_wing', label: 'SG', start: { x: 18, z: 8 }, hasBall: false },
      { id: 'o_corner', team: 'offense', role: 'weak_corner', label: 'C', start: { x: -22, z: 1 } },
      { id: 'o_slot', team: 'offense', role: 'slot', label: 'PF', start: { x: 9, z: 18 } },
      { id: 'o_post', team: 'offense', role: 'post', label: 'C', start: { x: 6, z: 4 } },
      { id: 'd_user', team: 'defense', role: 'perimeter_defender', label: 'You', start: { x: 10, z: 14 }, isUser: true },
      { id: 'd_handler', team: 'defense', role: 'on_ball', label: 'D', start: { x: -9, z: 22 } },
      { id: 'd_corner', team: 'defense', role: 'weak_corner_d', label: 'D', start: { x: -19, z: 4 } },
      { id: 'd_slot', team: 'defense', role: 'slot_d', label: 'D', start: { x: 9, z: 22 } },
      { id: 'd_post', team: 'defense', role: 'post_d', label: 'D', start: { x: 7, z: 6 } },
    ],
    { start: { x: -10, z: 24 }, holderId: 'o_handler' },
    [
      // Skip pass arriving at the wing shooter — sets up the closeout read.
      { id: 'skip', playerId: 'ball', kind: 'pass', to: { x: 18, z: 8 }, durationMs: 600, caption: 'Skip pass to the wing' },
    ],
    [
      // User closes out high-hand, choppy feet from the gap.
      { id: 'closeout', playerId: 'd_user', kind: 'closeout', to: { x: 17, z: 9.5 }, durationMs: 700, caption: 'Inside-out closeout, high hand' },
    ],
  )

// =========================================================================
// cutting_relocation — user is an off-ball wing reading a defender head turn
// and cutting backdoor.
// =========================================================================
const cuttingRelocation: PresetBuilder = (id) =>
  preset(
    id,
    'cutting_relocation',
    [
      { id: 'o_handler', team: 'offense', role: 'ball_handler', label: 'PG', start: { x: 0, z: 22 }, hasBall: true },
      { id: 'o_user', team: 'offense', role: 'off_ball_wing', label: 'You', start: { x: 18, z: 10 }, isUser: true },
      { id: 'o_corner', team: 'offense', role: 'corner', label: 'SG', start: { x: -22, z: 1 } },
      { id: 'o_slot', team: 'offense', role: 'slot', label: 'PF', start: { x: -9, z: 17 } },
      { id: 'o_post', team: 'offense', role: 'post', label: 'C', start: { x: 5, z: 4 } },
      { id: 'd_handler', team: 'defense', role: 'on_ball', label: 'D', start: { x: 0, z: 24 } },
      { id: 'd_user', team: 'defense', role: 'wing_d', label: 'D', start: { x: 17, z: 12 } },
      { id: 'd_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: -20, z: 3 } },
      { id: 'd_slot', team: 'defense', role: 'slot_d', label: 'D', start: { x: -9, z: 19 } },
      { id: 'd_post', team: 'defense', role: 'post_d', label: 'D', start: { x: 6, z: 6 } },
    ],
    { start: { x: 0, z: 22 }, holderId: 'o_handler' },
    [
      // Defender turns his head — abstracted as a small drift away.
      { id: 'd_glance', playerId: 'd_user', kind: 'drift', to: { x: 16, z: 14 }, durationMs: 600, caption: "Defender's head turns" },
    ],
    [
      // User cuts hard backdoor; ball is delivered to the rim.
      { id: 'backdoor', playerId: 'o_user', kind: 'cut', to: { x: 4, z: 3 }, durationMs: 800, caption: 'Backdoor cut on the head turn' },
      { id: 'feed', playerId: 'ball', kind: 'pass', to: { x: 4, z: 3 }, delayMs: 250, durationMs: 500, caption: 'Slip the pass to the rim' },
    ],
  )

// =========================================================================
// help_defense_basics — user is one pass away on the weak side and must tag
// the lane on a wing drive.
// =========================================================================
const helpDefense: PresetBuilder = (id) =>
  preset(
    id,
    'help_defense_basics',
    [
      { id: 'o_handler', team: 'offense', role: 'driver', label: 'PG', start: { x: 18, z: 10 }, hasBall: true },
      { id: 'o_strong_corner', team: 'offense', role: 'strong_corner', label: 'SG', start: { x: 22, z: 1 } },
      { id: 'o_user_man', team: 'offense', role: 'weak_wing', label: 'SF', start: { x: -18, z: 10 } },
      { id: 'o_weak_corner', team: 'offense', role: 'weak_corner', label: 'PF', start: { x: -22, z: 1 } },
      { id: 'o_post', team: 'offense', role: 'post', label: 'C', start: { x: 6, z: 4 } },
      { id: 'd_handler', team: 'defense', role: 'on_ball', label: 'D', start: { x: 17, z: 12 } },
      { id: 'd_strong_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: 20, z: 3 } },
      { id: 'd_user', team: 'defense', role: 'weak_side_defender', label: 'You', start: { x: -16, z: 12 }, isUser: true },
      { id: 'd_weak_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: -20, z: 3 } },
      { id: 'd_post', team: 'defense', role: 'post_d', label: 'D', start: { x: 7, z: 6 } },
    ],
    { start: { x: 18, z: 10 }, holderId: 'o_handler' },
    [
      // Ball handler attacks middle — sets up the help read.
      { id: 'drive', playerId: 'o_handler', kind: 'drive', to: { x: 6, z: 12 }, durationMs: 700, caption: 'Drive comes middle' },
    ],
    [
      // User tags the nail.
      { id: 'tag', playerId: 'd_user', kind: 'rotation', to: { x: -3, z: 14 }, durationMs: 600, caption: 'Tag the nail, chest to ball' },
      // Recover out as ball is picked up.
      { id: 'recover', playerId: 'd_user', kind: 'rotation', to: { x: -16, z: 12 }, delayMs: 400, durationMs: 700, caption: 'Recover with high hands' },
    ],
  )

// =========================================================================
// low_man_rotation — strong-side drive beats the on-ball defender; user is
// weak-side low man and must protect the rim.
// =========================================================================
const lowManRotation: PresetBuilder = (id) =>
  preset(
    id,
    'low_man_rotation',
    [
      { id: 'o_handler', team: 'offense', role: 'driver', label: 'PG', start: { x: -18, z: 10 }, hasBall: true },
      { id: 'o_roller', team: 'offense', role: 'roller', label: 'C', start: { x: -8, z: 12 } },
      { id: 'o_strong_corner', team: 'offense', role: 'strong_corner', label: 'SG', start: { x: -22, z: 1 } },
      { id: 'o_weak_corner', team: 'offense', role: 'weak_corner', label: 'SF', start: { x: 22, z: 1 } },
      { id: 'o_weak_wing', team: 'offense', role: 'weak_wing', label: 'PF', start: { x: 18, z: 12 } },
      { id: 'd_handler', team: 'defense', role: 'on_ball', label: 'D', start: { x: -17, z: 12 } },
      { id: 'd_roller', team: 'defense', role: 'big_drop', label: 'D', start: { x: -8, z: 9 } },
      { id: 'd_strong_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: -20, z: 3 } },
      { id: 'd_user', team: 'defense', role: 'weak_side_low_man', label: 'You', start: { x: 18, z: 4 }, isUser: true },
      { id: 'd_weak_wing', team: 'defense', role: 'weak_wing_d', label: 'D', start: { x: 17, z: 14 } },
    ],
    { start: { x: -18, z: 10 }, holderId: 'o_handler' },
    [
      // Driver beats his man, attacking the rim down the lane.
      { id: 'drive', playerId: 'o_handler', kind: 'drive', to: { x: -3, z: 4 }, durationMs: 800, caption: 'Drive beats on-ball' },
    ],
    [
      // Low man sprints baseline to meet at the restricted area.
      { id: 'rotate', playerId: 'd_user', kind: 'rotation', to: { x: 3, z: 3 }, durationMs: 700, caption: 'Sprint baseline to the rim' },
    ],
  )

// =========================================================================
// spacing_fundamentals — user is an off-ball guard who must drift to the
// deep corner as a teammate drives middle.
// =========================================================================
const spacing: PresetBuilder = (id) =>
  preset(
    id,
    'spacing_fundamentals',
    [
      { id: 'o_handler', team: 'offense', role: 'driver', label: 'PG', start: { x: 0, z: 22 }, hasBall: true },
      { id: 'o_user', team: 'offense', role: 'off_ball_guard', label: 'You', start: { x: -16, z: 10 }, isUser: true },
      { id: 'o_strong_wing', team: 'offense', role: 'strong_wing', label: 'SG', start: { x: 18, z: 10 } },
      { id: 'o_strong_corner', team: 'offense', role: 'strong_corner', label: 'SF', start: { x: 22, z: 1 } },
      { id: 'o_post', team: 'offense', role: 'post', label: 'C', start: { x: 5, z: 4 } },
      { id: 'd_handler', team: 'defense', role: 'on_ball', label: 'D', start: { x: 0, z: 24 } },
      { id: 'd_user', team: 'defense', role: 'gap_helper', label: 'D', start: { x: -10, z: 14 } },
      { id: 'd_strong_wing', team: 'defense', role: 'wing_d', label: 'D', start: { x: 17, z: 12 } },
      { id: 'd_strong_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: 20, z: 3 } },
      { id: 'd_post', team: 'defense', role: 'post_d', label: 'D', start: { x: 6, z: 6 } },
    ],
    { start: { x: 0, z: 22 }, holderId: 'o_handler' },
    [
      // Teammate drives middle.
      { id: 'drive', playerId: 'o_handler', kind: 'drive', to: { x: 0, z: 10 }, durationMs: 700, caption: 'Teammate drives middle' },
    ],
    [
      // User drifts to the deep corner to widen help.
      { id: 'drift', playerId: 'o_user', kind: 'drift', to: { x: -22, z: 1.5 }, durationMs: 800, caption: 'Drift to the deep corner' },
      // Pass arrives for a clean kickout.
      { id: 'kickout', playerId: 'ball', kind: 'pass', to: { x: -22, z: 1.5 }, delayMs: 400, durationMs: 500, caption: 'Kickout opens up' },
    ],
  )

// =========================================================================
// transition_stop_ball — user is first back in 3-on-2 transition.
// =========================================================================
const transitionStopBall: PresetBuilder = (id) =>
  preset(
    id,
    'transition_stop_ball',
    [
      { id: 'o_handler', team: 'offense', role: 'transition_handler', label: 'PG', start: { x: 0, z: 36 }, hasBall: true },
      { id: 'o_left', team: 'offense', role: 'left_filler', label: 'SG', start: { x: -16, z: 30 } },
      { id: 'o_right', team: 'offense', role: 'right_filler', label: 'SF', start: { x: 16, z: 30 } },
      { id: 'd_user', team: 'defense', role: 'first_back_defender', label: 'You', start: { x: 0, z: 22 }, isUser: true },
      { id: 'd_help', team: 'defense', role: 'second_back_defender', label: 'D', start: { x: 0, z: 30 } },
    ],
    { start: { x: 0, z: 36 }, holderId: 'o_handler' },
    [
      // Ball pushes hard at the user.
      { id: 'push', playerId: 'o_handler', kind: 'drive', to: { x: 0, z: 26 }, durationMs: 700, caption: 'Ball pushes downhill' },
    ],
    [
      // User stops the ball above the charge circle.
      { id: 'stop_ball', playerId: 'd_user', kind: 'stop_ball', to: { x: 0, z: 18 }, durationMs: 600, caption: 'Stop the ball above the charge circle' },
      // Help defender retreats to protect the rim.
      { id: 'help_retreat', playerId: 'd_help', kind: 'rotation', to: { x: 0, z: 5 }, durationMs: 700, caption: 'Help takes the rim' },
    ],
  )

const REGISTRY: Record<string, PresetBuilder> = {
  closeouts,
  cutting_relocation: cuttingRelocation,
  help_defense_basics: helpDefense,
  low_man_rotation: lowManRotation,
  spacing_fundamentals: spacing,
  transition_stop_ball: transitionStopBall,
}

/**
 * Returns a preset Scene3D for the first matching concept tag, or null if
 * none of the tags has a preset registered.
 */
export function getPresetForConcept(scenarioId: string, conceptTags: string[]): Scene3D | null {
  for (const tag of conceptTags) {
    const builder = REGISTRY[tag]
    if (builder) return builder(scenarioId)
  }
  return null
}

export const KNOWN_CONCEPT_PRESETS = Object.keys(REGISTRY)
