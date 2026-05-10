/**
 * P2.6 — Decoder visual primitive map.
 *
 * The map captures, for each decoder family, the readability primitives
 * a scenario MUST express to be teachable: which `AnimationIntent`s
 * must be reachable for the primary roles, which scene-data fields
 * must be authored, and what the freeze-frame teaching cue looks like.
 *
 * Shape goals:
 *   - Stable reference for scenario authors. A new founder scenario
 *     can be checklisted against `requiredIntents` and `requiredAuthoring`
 *     before it ships.
 *   - Stable reference for QA. The founder scenario invariant test
 *     reads this map so a missing primitive trips an authoring lock,
 *     not a hand-rolled per-decoder assertion that drifts.
 *   - Stable reference for the renderer. Future overlays / camera
 *     hints can read the same map to know what to emphasise.
 *
 * The map is data, not policy. It DOES NOT mutate scenario data, drive
 * player movement, or short-circuit the existing intent dispatch — the
 * existing `getDecoderAnimationIntent` table remains the source of
 * truth for "given decoder + role, what intent renders?".
 *
 * Architecture lock:
 *   - Pure data + types. No THREE.js, no scene reads, no clocks.
 *   - Same inputs always produce the same outputs (frozen objects).
 */

import type { AnimationIntent, DecoderRole } from './animationIntent'
import type { DecoderTag } from './schema'

/**
 * The teaching beat each decoder must communicate. Mirrors the human-
 * readable copy in `docs/phase-p-film-room-animation-architecture.md`
 * §6 so docs and runtime drift together, not apart.
 */
export interface DecoderTeachingBeat {
  /** Who is making the read? */
  readActor: DecoderRole
  /** Which defender's body language is the cue? */
  cueActor: DecoderRole
  /** One-sentence plain-English read for QA / future caption authoring. */
  readSentence: string
}

/**
 * Authoring fields a scenario JSON MUST carry to be teachable. Used by
 * the founder-scenario invariant test as a single typed checklist.
 */
export interface DecoderAuthoringRequirements {
  /** Must declare a freeze marker (atMs or beforeMovementId). */
  requiresFreezeMarker: true
  /** Must declare an `answerDemo` movement list. */
  requiresAnswerDemo: true
  /** Must declare at least one player with `isUser: true`. */
  requiresUserPlayer: true
  /** Must declare exactly one offensive player with `hasBall: true`. */
  requiresOneBallHolder: true
  /** Roles that must appear among the scene players (substring match
   *  on `ScenePlayer.role`, case-insensitive). */
  requiredPlayerRoleSubstrings: readonly string[]
  /** Movement kinds that must appear in the `answerDemo` list. */
  requiredAnswerDemoKinds: readonly (
    | 'cut'
    | 'closeout'
    | 'rotation'
    | 'lift'
    | 'drift'
    | 'pass'
    | 'drive'
    | 'stop_ball'
    | 'back_cut'
    | 'baseline_sneak'
    | 'skip_pass'
    | 'rip'
    | 'jab'
  )[]
}

export interface DecoderVisualPrimitives {
  /** Decoder this entry describes. */
  decoder: DecoderTag
  /** Plain-English teaching label. */
  label: string
  /** The teaching beat the freeze frame should communicate. */
  beat: DecoderTeachingBeat
  /** AnimationIntents the renderer must be able to surface for this
   *  decoder. Each entry describes a role and the canonical intent
   *  that role plays. Mirrors `getDecoderAnimationIntent` so a
   *  drift between the two will be caught by the invariant test. */
  requiredIntents: ReadonlyArray<{
    role: DecoderRole
    intent: AnimationIntent
    rationale: string
  }>
  /** Scenario-data invariants. */
  requiredAuthoring: DecoderAuthoringRequirements
}

const BACKDOOR_WINDOW: DecoderVisualPrimitives = {
  decoder: 'BACKDOOR_WINDOW',
  label: 'Backdoor Window',
  beat: {
    readActor: 'cutter',
    cueActor: 'deny_defender',
    readSentence:
      'Defender denies the wing — cutter goes backdoor — passer hits the open space.',
  },
  requiredIntents: [
    { role: 'cutter', intent: 'BACK_CUT', rationale: 'Cutter must accelerate behind the denier.' },
    { role: 'deny_defender', intent: 'DEFENSIVE_DENY', rationale: 'Denier hand/foot in the lane is the cue.' },
    { role: 'passer', intent: 'PASS_FOLLOWTHROUGH', rationale: 'Passer reacts to the cut, not anticipates.' },
    { role: 'receiver', intent: 'RECEIVE_READY', rationale: 'Catch pose at the rim is readable, not a sprint cycle.' },
  ],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler', 'denying'],
    requiredAnswerDemoKinds: ['back_cut', 'pass'],
  },
}

const ADVANTAGE_OR_RESET: DecoderVisualPrimitives = {
  decoder: 'ADVANTAGE_OR_RESET',
  label: 'Advantage or Reset',
  beat: {
    readActor: 'receiver',
    cueActor: 'closeout_defender',
    readSentence:
      'Catch and read the closeout — shoot if open, attack the cushion, or reset.',
  },
  requiredIntents: [
    { role: 'receiver', intent: 'RECEIVE_READY', rationale: 'Catch-and-read pose communicates "I am reading the closeout."' },
    { role: 'closeout_defender', intent: 'CLOSEOUT', rationale: 'Forward closeout body language is the cue.' },
    { role: 'helper_defender', intent: 'SLIDE_RECOVER', rationale: 'Help recovery shows the second defender position.' },
    { role: 'passer', intent: 'PASS_FOLLOWTHROUGH', rationale: 'Initial pass into the read.' },
  ],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler', 'shooter'],
    requiredAnswerDemoKinds: ['lift'],
  },
}

const EMPTY_SPACE_CUT: DecoderVisualPrimitives = {
  decoder: 'EMPTY_SPACE_CUT',
  label: 'Empty Space Cut',
  beat: {
    readActor: 'cutter',
    cueActor: 'helper_defender',
    readSentence:
      'Helper steps over to ball — cutter fills the empty space — passer hits the cutter.',
  },
  requiredIntents: [
    { role: 'cutter', intent: 'EMPTY_SPACE_CUT', rationale: 'Cutter reads vacated paint and fills it.' },
    { role: 'helper_defender', intent: 'DEFENSIVE_HELP_TURN', rationale: 'Help-turn body language is the cue.' },
    { role: 'receiver', intent: 'RECEIVE_READY', rationale: 'Catch in the open space is a calm pose, not a sprint.' },
    { role: 'passer', intent: 'PASS_FOLLOWTHROUGH', rationale: 'Passer reacts to the help shift.' },
  ],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler', 'help'],
    requiredAnswerDemoKinds: ['cut', 'pass'],
  },
}

const SKIP_THE_ROTATION: DecoderVisualPrimitives = {
  decoder: 'SKIP_THE_ROTATION',
  label: 'Skip the Rotation',
  beat: {
    readActor: 'passer',
    cueActor: 'helper_defender',
    readSentence:
      'Help over-rotates one side — passer skips weakside — open shooter catches and shoots.',
  },
  requiredIntents: [
    { role: 'passer', intent: 'PASS_FOLLOWTHROUGH', rationale: 'Skip-pass follow-through is the action.' },
    { role: 'open_player', intent: 'SHOT_READY', rationale: 'Weakside shooter is in catch-and-shoot pose.' },
    { role: 'helper_defender', intent: 'DEFENSIVE_HELP_TURN', rationale: 'Over-help body language is the cue.' },
    { role: 'closeout_defender', intent: 'CLOSEOUT', rationale: 'Recovery closeout shows the second-side advantage.' },
  ],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler', 'help'],
    requiredAnswerDemoKinds: ['skip_pass'],
  },
}

// Pack 2 (Phase β) — DROP / READ_THE_COVERAGE D1/D2 entry. Promoted
// from the original empty scaffold to the real teaching beat: the PnR
// ball-handler reads the screen defender's body language at the
// moment the screen is set. A drop defender sits below the screen,
// belly forward, weight back — the cue is on his chest line + foot
// angle. The advantage is the pull-up pocket between the screen and
// the retreating big.
//
// `requiredIntents` stays empty here for two reasons:
//   1. The founder DecoderRole union does not include screen_defender
//      / ball_handler (PnR-specific roles); adding them is a Phase γ
//      animation-intent change that this slice intentionally avoids.
//   2. DROP D1/D2 ride the existing helper_defender / receiver intents
//      under the hood — there is no new clip authoring required for
//      D1/D2, so the founder invariant has nothing decoder-specific
//      to assert.
//
// HUNT remains a scaffold (D3+, chained-second-read) — its content is
// owned by Phase γ and stays a stub here.
const READ_THE_COVERAGE: DecoderVisualPrimitives = {
  decoder: 'READ_THE_COVERAGE',
  label: 'Read the Coverage',
  beat: {
    // The PnR ball-handler is the read actor — they decide whether to
    // pull, snake, or attack based on the screen defender's posture.
    readActor: 'open_player',
    // The screen defender is the cue. We map him to helper_defender in
    // the founder taxonomy because that's the existing role with
    // matching body-language coverage (turn, drop, recover); a future
    // animation-intent expansion can promote a dedicated
    // screen_defender role.
    cueActor: 'helper_defender',
    readSentence:
      'Screen defender drops below the screen — ball-handler reads the pocket and pulls / snakes / attacks before help recovers.',
  },
  requiredIntents: [],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler', 'screen_defender'],
    requiredAnswerDemoKinds: [],
  },
}

const HUNT_THE_ADVANTAGE_PACK2_STUB: DecoderVisualPrimitives = {
  decoder: 'HUNT_THE_ADVANTAGE',
  label: 'Hunt the Advantage',
  beat: {
    readActor: 'receiver',
    cueActor: 'closeout_defender',
    readSentence:
      'Pack 2 stub — HUNT chained second read. Full beat designed in 3.1.2.',
  },
  requiredIntents: [],
  requiredAuthoring: {
    requiresFreezeMarker: true,
    requiresAnswerDemo: true,
    requiresUserPlayer: true,
    requiresOneBallHolder: true,
    requiredPlayerRoleSubstrings: ['ball_handler'],
    requiredAnswerDemoKinds: [],
  },
}

/**
 * Per-decoder visual primitive map. Frozen at module load so consumers
 * cannot accidentally mutate the shared reference.
 */
export const DECODER_VISUAL_PRIMITIVES: Readonly<
  Record<DecoderTag, DecoderVisualPrimitives>
> = Object.freeze({
  BACKDOOR_WINDOW,
  ADVANTAGE_OR_RESET,
  EMPTY_SPACE_CUT,
  SKIP_THE_ROTATION,
  READ_THE_COVERAGE,
  HUNT_THE_ADVANTAGE: HUNT_THE_ADVANTAGE_PACK2_STUB,
})

/** Convenience accessor — same shape as a Map.get with a clean fallback. */
export function getDecoderVisualPrimitives(
  decoder: DecoderTag,
): DecoderVisualPrimitives {
  return DECODER_VISUAL_PRIMITIVES[decoder]
}

/**
 * The full set of AnimationIntents that are "stationary catch / read /
 * reset" body language. The renderer's clip resolver routes these to a
 * dedicated `receive_ready` clip rather than the legacy `cut_sprint`
 * fallback so a stationary catcher doesn't visibly run in place.
 */
export const STATIONARY_READ_INTENTS: readonly AnimationIntent[] = Object.freeze([
  'RECEIVE_READY',
  'SHOT_READY',
  'RESET_HOLD',
])

/**
 * The set of AnimationIntents that should render with a forward-
 * closeout body language when the imported clip flag is off. The
 * renderer's clip resolver routes these to a dedicated `closeout_read`
 * fallback rather than the lateral `defense_slide` fallback.
 */
export const FORWARD_CLOSEOUT_INTENTS: readonly AnimationIntent[] = Object.freeze([
  'CLOSEOUT',
])
