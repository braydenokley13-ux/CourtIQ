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
 * Twenty founder-v0 entries (five per Pack 1 family) plus Pack 2
 * additions (DROP, HUNT). Authored from §14 of the planning doc and
 * extended by the Pack 2 phase-γ rollout; mirrors the same row shape
 * so the dev-only QA preview surfaces every shipped scenario.
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

  // -- DROP family (Pack 2 / Phase β + γ) -----------------------------------
  {
    id: 'DROP-01',
    decoder: 'READ_THE_COVERAGE',
    primaryCue: 'x5 chest below the screen, feet to the rim',
    requiredFraming:
      'Ball-handler off the screen, x5 in drop posture, pocket visible',
    requiredHighlight: 'x5 (screen defender)',
    requiredOverlays: [
      'defender_chest_line',
      'defender_foot_arrow',
      'label',
    ],
    knownRisk:
      'Pocket region must read as open even with the screen body in frame',
    priority: 'high',
  },
  {
    id: 'DROP-01-MIRROR',
    decoder: 'READ_THE_COVERAGE',
    primaryCue:
      'Mirrored: x5 chest below the screen, screen set from the left side',
    requiredFraming:
      'Ball-handler off a LEFT-side screen, x5 in drop posture, left-side pocket visible (DROP-01 framing flipped across y-axis)',
    requiredHighlight: 'x5 (screen defender, left side of screen)',
    requiredOverlays: [
      'defender_chest_line',
      'defender_foot_arrow',
      'label',
    ],
    knownRisk:
      'Mirror cognition collapse — if pull-up choice rate drops vs DROP-01, the chest cue did not transfer. Treat as a mastery-transfer probe rather than a new puzzle.',
    priority: 'high',
  },
  {
    id: 'DROP-02',
    decoder: 'READ_THE_COVERAGE',
    primaryCue: 'x5 chest below the elbow, vision locked on ball-handler',
    requiredFraming:
      'Ball-handler turning the corner, x5 deep, middle of the floor visible behind him',
    requiredHighlight: 'x5 (screen defender) + middle paint',
    requiredOverlays: [
      'defender_chest_line',
      'defender_foot_arrow',
      'defender_vision_cone',
    ],
    knownRisk:
      'Snake path must paint cleanly across the screen — risk of camera hiding the cross-back',
    priority: 'high',
  },
  {
    id: 'DROP-02-MIRROR',
    decoder: 'READ_THE_COVERAGE',
    primaryCue:
      'Mirrored: x5 chest below the elbow, vision locked on ball-handler, LEFT-side screen',
    requiredFraming:
      'Ball-handler turning the LEFT corner, x5 deep, RIGHT middle of the floor visible behind him (DROP-02 framing flipped across y-axis)',
    requiredHighlight: 'x5 (screen defender, left side) + middle paint',
    requiredOverlays: [
      'defender_chest_line',
      'defender_foot_arrow',
      'defender_vision_cone',
    ],
    knownRisk:
      'Mirror cognition collapse at D2 — if snake choice rate drops vs DROP-02 the player anchored on right-side geometry. Snake path must paint cleanly across the screen in the mirrored direction too — camera framing must show the right-side middle after the cross-back.',
    priority: 'high',
  },
  {
    id: 'DROP-03',
    decoder: 'READ_THE_COVERAGE',
    primaryCue:
      'x5 in drop AND x2 (low man) both feet in the lane — full tag commit',
    requiredFraming:
      'Ball-handler off the screen, x5 in drop, roller in the lane, x2 stepped fully into the tag, weak corner empty behind x2',
    requiredHighlight: 'x2 (low man tagger) + the vacated weak corner',
    requiredOverlays: [
      'defender_chest_line',
      'help_pulse',
      'defender_hip_arrow',
    ],
    knownRisk:
      'Two-defender cue cluster — the chest_line on x5 must not steal attention from the help_pulse on x2; intermediate cluster cap is 4 and this scene runs to the cap',
    priority: 'high',
  },

  // -- HUNT family (Pack 2 / Phase γ) ---------------------------------------
  {
    id: 'HUNT-01',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Beat 1 mismatch on x4; beat 2 trailing recovery foot baseline',
    requiredFraming:
      'Wing user, x4 (post defender) on the hip, baseline lane visible at beat 2',
    requiredHighlight: 'x4 (mismatch defender)',
    requiredOverlays: [
      'help_pulse',
      'defender_chest_line',
      'defender_foot_arrow',
    ],
    knownRisk:
      'Beat 2 cluster must swap chest_line for foot_arrow without re-stacking — diff cognition relies on the change',
    priority: 'high',
  },
  {
    id: 'HUNT-01-MIRROR',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Mirrored: beat 1 mismatch on x4 (left wing); beat 2 trailing recovery foot, LEFT baseline',
    requiredFraming:
      'Left-wing user, x4 on the hip, left baseline lane visible at beat 2 (HUNT-01 framing flipped across y-axis)',
    requiredHighlight: 'x4 (mismatch defender, left side)',
    requiredOverlays: [
      'help_pulse',
      'defender_chest_line',
      'defender_foot_arrow',
    ],
    knownRisk:
      'Mirror cognition collapse — if recognition drops vs HUNT-01, the player memorized geometry instead of the cue. Treat as a mastery-transfer probe rather than a new puzzle.',
    priority: 'high',
  },
  {
    id: 'HUNT-02',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Beat 1 hip arrow on x5 (switch coming); beat 2 mismatch chest square',
    requiredFraming:
      'PnR ball-handler off the screen, x5 visibly switching, baseline lane visible at beat 2',
    requiredHighlight: 'x5 (post defender, post-switch)',
    requiredOverlays: [
      'help_pulse',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk:
      'Switch animation must complete inside the inter-beat window — late switch breaks the chain',
    priority: 'high',
  },
  {
    id: 'HUNT-02-MIRROR',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Mirrored: beat 1 hip arrow on x5 (LEFT-side screen, switch coming); beat 2 mismatch chest square',
    requiredFraming:
      'PnR ball-handler off a LEFT-side screen, x5 visibly switching, LEFT baseline lane visible at beat 2 (HUNT-02 framing flipped across y-axis)',
    requiredHighlight: 'x5 (post defender, post-switch, left side)',
    requiredOverlays: [
      'help_pulse',
      'defender_hip_arrow',
      'defender_chest_line',
    ],
    knownRisk:
      'Mirror cognition collapse at D2 — if recognition drops vs HUNT-02 the player chained geometry instead of the cues. Switch animation timing must also stay inside the inter-beat window on the left side; mirroring movement coords can re-introduce drift if not tuned.',
    priority: 'high',
  },
  {
    id: 'HUNT-03',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Beat 1 mismatch + hip arrow on x1; beat 2 hand-in-lane + foot arrow on x1 after the DHO bait fires',
    requiredFraming:
      'Wing ball-handler with screener walking into a DHO, x1 shaded to the handoff, slip lane to rim visible at beat 2',
    requiredHighlight: 'x1 (on-ball, baited)',
    requiredOverlays: [
      'help_pulse',
      'defender_hand_in_lane',
      'defender_foot_arrow',
    ],
    knownRisk:
      'Decoy DHO must read as a fake — risk that the handoff animation looks committed and the slip reads as a turnover',
    priority: 'high',
  },
  {
    id: 'HUNT-03-MIRROR',
    decoder: 'HUNT_THE_ADVANTAGE',
    primaryCue:
      'Mirrored: beat 1 mismatch + hip arrow on x1 (LEFT-side DHO); beat 2 hand-in-lane + foot arrow on x1 after the bait fires',
    requiredFraming:
      'LEFT-wing ball-handler with screener walking into a DHO, x1 shaded to the handoff, LEFT-side slip lane to rim visible at beat 2 (HUNT-03 framing flipped across y-axis)',
    requiredHighlight: 'x1 (on-ball, baited, left side)',
    requiredOverlays: [
      'help_pulse',
      'defender_hand_in_lane',
      'defender_foot_arrow',
    ],
    knownRisk:
      'Mirror cognition collapse at D3 — if slip-pass choice rate drops vs HUNT-03 the player chained the right-side geometry, not the cues. The DHO fake must also still read as a decoy when mirrored — copy-paste of the right-side animation curve into the left side can re-introduce drift that makes the handoff look committed.',
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
