/**
 * FR-1 — Founder-v0 Film-Room QA Matrix.
 *
 * Per-scenario contract embedded as pure data. Mirrors §14 of
 * `docs/courtiq-3d-film-room-system-plan.md`. The dev-only
 * `/dev/scenario-preview` page renders the matching row alongside
 * the live canvas so a reviewer can validate against the contract.
 *
 * Pure data + types only. No THREE.js, no React, no I/O. Safe to
 * import from server, client, and tests.
 */

import type { DecoderTag } from './schema'

export type QaPriority = 'high' | 'medium' | 'low'

export interface QaMatrixEntry {
  /** Founder-v0 scenario id (`BDW-01`, `ESC-03`, etc.). */
  id: string
  /** Decoder family tag the scenario belongs to. */
  decoder: DecoderTag
  /** The body cue that, by itself, sells the read. */
  primaryCue: string
  /** What must be visible in the freeze frame for the read to land. */
  requiredFraming: string
  /** Beyond the standard user/ball, who must be visually emphasized. */
  requiredHighlight: string
  /** Minimum pre-answer overlay set (per §9.1 of the plan). */
  requiredOverlays: readonly string[]
  /** The most likely failure mode for this scenario. */
  knownRisk: string
  /** Front-of-FR-1-QA priority. */
  priority: QaPriority
}

/**
 * Twenty entries — five per decoder family. Authored from §14 of the
 * planning doc; do not edit without updating the doc.
 */
export const QA_MATRIX: readonly QaMatrixEntry[] = [
  // -- BDW family ----------------------------------------------------------
  {
    id: 'BDW-01',
    decoder: 'BACKDOOR_WINDOW',
    primaryCue: 'x2 hand-in-lane (wing denial)',
    requiredFraming: 'User, x2, PG, rim corridor visible',
    requiredHighlight: 'x2 (key defender)',
    requiredOverlays: [
      'defender_hand_in_lane',
      'defender_vision_cone',
      'passing_lane_blocked',
    ],
    knownRisk:
      'x2 hand may not render visibly on procedural fallback',
    priority: 'high',
  },
  {
    id: 'BDW-02',
    decoder: 'BACKDOOR_WINDOW',
    primaryCue: 'x_top chest above user (top-lock)',
    requiredFraming: 'User at slot, x_top denying, middle lane visible',
    requiredHighlight: 'x_top',
    requiredOverlays: [
      'defender_chest_line',
      'defender_hand_in_lane',
      'defender_vision_cone',
    ],
    knownRisk: 'Camera may hide the middle lane behind the user',
    priority: 'high',
  },
  {
    id: 'BDW-03',
    decoder: 'BACKDOOR_WINDOW',
    primaryCue: 'x3 top-locks corner',
    requiredFraming: 'User in corner, x3, baseline lane visible',
    requiredHighlight: 'x3',
    requiredOverlays: [
      'defender_hand_in_lane',
      'defender_chest_line',
      'passing_lane_blocked',
    ],
    knownRisk: 'Baseline corridor may clip out of frame on phone',
    priority: 'high',
  },
  {
    id: 'BDW-04',
    decoder: 'BACKDOOR_WINDOW',
    primaryCue: 'x_user jumps the flare',
    requiredFraming:
      'User on weak wing, x_user mid-jump, screener space visible',
    requiredHighlight: 'x_user',
    requiredOverlays: [
      'defender_hip_arrow',
      'defender_chest_line',
      'defender_vision_cone',
    ],
    knownRisk: 'The "cheat" pose is hard to read without a clip',
    priority: 'medium',
  },
  {
    id: 'BDW-05',
    decoder: 'BACKDOOR_WINDOW',
    primaryCue: 'Lift defender beats user to wing',
    requiredFraming:
      'User mid-lift, defender ahead, baseline open',
    requiredHighlight: 'x_user',
    requiredOverlays: [
      'defender_foot_arrow',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk: 'Reverse-cut path may not paint cleanly post-answer',
    priority: 'medium',
  },

  // -- ESC family ----------------------------------------------------------
  {
    id: 'ESC-01',
    decoder: 'EMPTY_SPACE_CUT',
    primaryCue: 'D4 head turn to ball',
    requiredFraming:
      'User on weak wing, D4 turned, empty corner visible',
    requiredHighlight: 'D4',
    requiredOverlays: [
      'defender_vision_cone',
      'defender_hip_arrow',
      'help_pulse',
    ],
    knownRisk:
      '"Eyes turn" cue may not be visible without a clip; vision cone has to do the work',
    priority: 'high',
  },
  {
    id: 'ESC-02',
    decoder: 'EMPTY_SPACE_CUT',
    primaryCue: 'D4 hips turn to roller',
    requiredFraming: 'User at slot, D4 mid-tag, empty slot',
    requiredHighlight: 'D4',
    requiredOverlays: [
      'defender_hip_arrow',
      'help_pulse',
      'defender_vision_cone',
    ],
    knownRisk: 'Multiple cues stack; risk of clutter',
    priority: 'high',
  },
  {
    id: 'ESC-03',
    decoder: 'EMPTY_SPACE_CUT',
    primaryCue: 'D3 head turned to ball, skip in air',
    requiredFraming:
      'User in weak corner, ball mid-skip, D3 flat-footed',
    requiredHighlight: 'D3 + ball',
    requiredOverlays: [
      'defender_vision_cone',
      'defender_hip_arrow',
      'help_pulse',
    ],
    knownRisk: 'Pass arc must not block the cue',
    priority: 'medium',
  },
  {
    id: 'ESC-04',
    decoder: 'EMPTY_SPACE_CUT',
    primaryCue: 'x_weak stunt foot in lane',
    requiredFraming:
      'User on weak wing, post on block, stunt foot visible',
    requiredHighlight: 'x_weak',
    requiredOverlays: [
      'defender_foot_arrow',
      'help_pulse',
      'defender_vision_cone',
    ],
    knownRisk: 'Stunt foot is small at broadcast distance',
    priority: 'medium',
  },
  {
    id: 'ESC-05',
    decoder: 'EMPTY_SPACE_CUT',
    primaryCue: 'User’s defender ball-watching',
    requiredFraming:
      'User at weak slot, vacated wing, defender turned',
    requiredHighlight: 'x_user',
    requiredOverlays: [
      'defender_hip_arrow',
      'defender_vision_cone',
      'help_pulse',
    ],
    knownRisk: '"Ball-watcher" is the most subtle cue in the family',
    priority: 'medium',
  },

  // -- AOR family ----------------------------------------------------------
  {
    id: 'AOR-01',
    decoder: 'ADVANTAGE_OR_RESET',
    primaryCue: 'D4 parallel feet, momentum forward',
    requiredFraming:
      'User catching wing, D4 closeout pose, lane clear',
    requiredHighlight: 'D4 (feet)',
    requiredOverlays: [
      'defender_foot_arrow',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk:
      'Feet are tiny at broadcast distance; need low camera',
    priority: 'high',
  },
  {
    id: 'AOR-02',
    decoder: 'ADVANTAGE_OR_RESET',
    primaryCue: 'D4 set, balanced, hand high',
    requiredFraming:
      'User catching, D4 stable, no driving lane',
    requiredHighlight: 'D4',
    requiredOverlays: [
      'defender_foot_arrow',
      'defender_chest_line',
      'defender_hip_arrow',
    ],
    knownRisk:
      'Easy to confuse with AOR-01 if camera doesn’t show the difference',
    priority: 'high',
  },
  {
    id: 'AOR-03',
    decoder: 'ADVANTAGE_OR_RESET',
    primaryCue: 'D4 still 4 ft away on catch',
    requiredFraming:
      'User catching wing, D4 mid-stride, shooting pocket open',
    requiredHighlight: 'D4 + user shooting pocket',
    requiredOverlays: [
      'defender_foot_arrow',
      'open_space_region',
      'label',
    ],
    knownRisk:
      'Shooting pocket overlay must paint pre-answer; today no kind exists for "distance label"',
    priority: 'medium',
  },
  {
    id: 'AOR-04',
    decoder: 'ADVANTAGE_OR_RESET',
    primaryCue: 'D4 chest tilted, weight back',
    requiredFraming:
      'User in corner, D4 high closeout, baseline open',
    requiredHighlight: 'D4 chest',
    requiredOverlays: [
      'defender_chest_line',
      'defender_foot_arrow',
      'defender_hip_arrow',
    ],
    knownRisk:
      'Chest-tilt reads as "lean," not "high closeout" without practice',
    priority: 'medium',
  },
  {
    id: 'AOR-05',
    decoder: 'ADVANTAGE_OR_RESET',
    primaryCue: 'D_user sideways, lead foot at ball',
    requiredFraming:
      'User on weak wing, D_user recovering sideways',
    requiredHighlight: 'D_user (hip)',
    requiredOverlays: [
      'defender_hip_arrow',
      'defender_foot_arrow',
      'defender_chest_line',
    ],
    knownRisk:
      'Branched read (drive/reset) requires correct intent dispatch',
    priority: 'high',
  },

  // -- SKR family ----------------------------------------------------------
  {
    id: 'SKR-01',
    decoder: 'SKIP_THE_ROTATION',
    primaryCue: 'D5 stunt + paint collapse',
    requiredFraming:
      'Driver, paint shading, weak corner empty',
    requiredHighlight: 'D5',
    requiredOverlays: [
      'help_pulse',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk:
      'Diagonal of the floor must be visible — Help Defense Angle required',
    priority: 'high',
  },
  {
    id: 'SKR-02',
    decoder: 'SKIP_THE_ROTATION',
    primaryCue: 'Tagger pulled to roller',
    requiredFraming:
      'Ball-handler, tagger committed, weak corner open',
    requiredHighlight: 'Tagger',
    requiredOverlays: [
      'help_pulse',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk: 'Roller and tagger may overlap in frame',
    priority: 'medium',
  },
  {
    id: 'SKR-03',
    decoder: 'SKIP_THE_ROTATION',
    primaryCue: 'Double-team on post',
    requiredFraming: 'Post + double, weak corner empty',
    requiredHighlight: 'Bracketing defender',
    requiredOverlays: [
      'help_pulse',
      'defender_chest_line',
      'defender_hip_arrow',
    ],
    knownRisk: 'Double-team is two figures; may clutter',
    priority: 'medium',
  },
  {
    id: 'SKR-04',
    decoder: 'SKIP_THE_ROTATION',
    primaryCue: 'Help defender steps in on dribble-at',
    requiredFraming:
      'Ball-handler, helper step, weak corner open',
    requiredHighlight: 'Helper',
    requiredOverlays: [
      'help_pulse',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk: 'Dribble-at angle is unfamiliar to most viewers',
    priority: 'medium',
  },
  {
    id: 'SKR-05',
    decoder: 'SKIP_THE_ROTATION',
    primaryCue: 'X-out below, slot exposed',
    requiredFraming: 'Driver baseline, X-out arrows, weak slot',
    requiredHighlight: 'X-out defender',
    requiredOverlays: [
      'help_pulse',
      'defender_chest_line',
      'defender_hip_arrow',
    ],
    knownRisk:
      'Multiple defenders in motion — camera must isolate the cue',
    priority: 'high',
  },
] as const

/** All twenty founder-v0 ids in the canonical order the matrix uses. */
export const QA_MATRIX_IDS: readonly string[] = QA_MATRIX.map((e) => e.id)

/** Look up an entry by id. Returns `undefined` for unknown ids. */
export function getQaMatrixEntry(
  id: string,
): QaMatrixEntry | undefined {
  return QA_MATRIX.find((e) => e.id === id)
}

/** Group entries by decoder family for grouped UI rendering. */
export function groupQaMatrixByDecoder(): ReadonlyMap<
  DecoderTag,
  readonly QaMatrixEntry[]
> {
  const out = new Map<DecoderTag, QaMatrixEntry[]>()
  for (const e of QA_MATRIX) {
    const list = out.get(e.decoder) ?? []
    list.push(e)
    out.set(e.decoder, list)
  }
  return out as ReadonlyMap<DecoderTag, readonly QaMatrixEntry[]>
}
