/**
 * P2 — Film-Room Animation Intent Layer
 *
 * Bridges scenario *meaning* (decoder tags, player roles, movement
 * kinds) to animation *vocabulary* without hard-coding one-off
 * behaviour per clip or per scenario.
 *
 * Architecture contract:
 *   scenario meaning → AnimationIntent → clip / fallback
 *
 * The intent is the stable semantic handle. Clip availability changes
 * as assets land; intents do not. Consumers always go through an
 * intent rather than naming a clip directly.
 *
 * Safe for use in both browser and Node (no THREE.js dependency here).
 */

import type { DecoderTag } from './schema'
import type { SceneMovementKind, SceneTeam } from './scene'

// ---------------------------------------------------------------------------
// AnimationIntent vocabulary
// ---------------------------------------------------------------------------

/**
 * The 12 v1 animation intents.  Each string key is the stable
 * cross-decoder identifier; renderers map it to whatever clip is
 * currently available.
 *
 * Fallback ladder (when no dedicated clip exists for an intent):
 *   offense intents  → 'cut_sprint'  (for moving)  or 'idle_ready'
 *   defense intents  → 'defense_slide' (for moving) or 'idle_ready'
 *   CLOSEOUT         → 'closeout' clip when flag on, else 'defense_slide'
 */
export type AnimationIntent =
  /** Stationary but alert — default resting state for any player. */
  | 'IDLE_READY'
  /** Offensive player at catch point, weight loaded, ready to act. */
  | 'RECEIVE_READY'
  /** Quick offensive footwork — jab step or rip-through threat. */
  | 'JAB_OR_RIP'
  /** Backdoor cut; attacker reads denial and accelerates behind. */
  | 'BACK_CUT'
  /** Cutter reads vacated paint, fills the empty space. */
  | 'EMPTY_SPACE_CUT'
  /** Defender pressing passing lane; denial stance, active hands. */
  | 'DEFENSIVE_DENY'
  /** Help defender pivots/turns to recover to new threat. */
  | 'DEFENSIVE_HELP_TURN'
  /** Defender sprints at shooter to contest — the closeout read. */
  | 'CLOSEOUT'
  /** Defender slides laterally to recover after closeout commitment. */
  | 'SLIDE_RECOVER'
  /** Passer's follow-through after delivering the ball. */
  | 'PASS_FOLLOWTHROUGH'
  /** Offensive player in open catch position, ready to shoot. */
  | 'SHOT_READY'
  /** Offense holds with ball — no advantage, reset the action. */
  | 'RESET_HOLD'

export const ALL_ANIMATION_INTENTS: readonly AnimationIntent[] = [
  'IDLE_READY',
  'RECEIVE_READY',
  'JAB_OR_RIP',
  'BACK_CUT',
  'EMPTY_SPACE_CUT',
  'DEFENSIVE_DENY',
  'DEFENSIVE_HELP_TURN',
  'CLOSEOUT',
  'SLIDE_RECOVER',
  'PASS_FOLLOWTHROUGH',
  'SHOT_READY',
  'RESET_HOLD',
] as const

// ---------------------------------------------------------------------------
// Decoder → intent mapping
// ---------------------------------------------------------------------------

/**
 * Role string for decoder-intent lookup.  Kept as a plain union so
 * scenario authors and tests can pass the role from JSON without
 * importing a separate enum.
 *
 * receiver       — offensive player catching the ball
 * cutter         — offensive player making an off-ball cut
 * passer         — offensive player delivering the ball
 * open_player    — offensive player in catch-ready, open spot
 * closeout_defender — defender sprinting at the ball/shooter
 * helper_defender   — secondary defender rotating from help
 * deny_defender     — defender pressing an off-ball attacker's passing lane
 */
export type DecoderRole =
  | 'receiver'
  | 'cutter'
  | 'passer'
  | 'open_player'
  | 'closeout_defender'
  | 'helper_defender'
  | 'deny_defender'

/**
 * Optional branch context for multi-branch intents (AOR receiver
 * specifically diverges based on what the player decides to do).
 */
export type AorReceiverBranch = 'shot' | 'jab_or_rip' | 'reset'

/**
 * Decoder-to-intent mapping table, documented inline.
 *
 * AOR — ADVANTAGE_OR_RESET:
 *   receiver        → RECEIVE_READY (default), SHOT_READY, JAB_OR_RIP,
 *                     or RESET_HOLD depending on branch
 *   closeout_def    → CLOSEOUT
 *   helper_def      → SLIDE_RECOVER
 *
 * BDW — BACKDOOR_WINDOW:
 *   cutter          → BACK_CUT
 *   deny_defender   → DEFENSIVE_DENY
 *   passer          → PASS_FOLLOWTHROUGH
 *
 * ESC — EMPTY_SPACE_CUT:
 *   cutter          → EMPTY_SPACE_CUT
 *   receiver        → RECEIVE_READY
 *   helper_defender → DEFENSIVE_HELP_TURN
 *
 * SKR — SKIP_THE_ROTATION:
 *   passer          → PASS_FOLLOWTHROUGH
 *   open_player     → SHOT_READY (catch-and-shoot ready by definition)
 *   helper_defender → DEFENSIVE_HELP_TURN
 *   closeout_def    → CLOSEOUT
 */
export function getDecoderAnimationIntent(
  decoder: DecoderTag,
  role: DecoderRole,
  aorBranch?: AorReceiverBranch,
): AnimationIntent {
  switch (decoder) {
    case 'ADVANTAGE_OR_RESET':
      return _aorIntent(role, aorBranch)

    case 'BACKDOOR_WINDOW':
      return _bdwIntent(role)

    case 'EMPTY_SPACE_CUT':
      return _escIntent(role)

    case 'SKIP_THE_ROTATION':
      return _skrIntent(role)

    default:
      return 'IDLE_READY'
  }
}

function _aorIntent(role: DecoderRole, branch?: AorReceiverBranch): AnimationIntent {
  switch (role) {
    case 'receiver':
      if (branch === 'shot') return 'SHOT_READY'
      if (branch === 'jab_or_rip') return 'JAB_OR_RIP'
      if (branch === 'reset') return 'RESET_HOLD'
      return 'RECEIVE_READY'
    case 'closeout_defender':
      return 'CLOSEOUT'
    case 'helper_defender':
      return 'SLIDE_RECOVER'
    // safe defaults for roles not primary in AOR
    case 'passer':
      return 'PASS_FOLLOWTHROUGH'
    case 'open_player':
      return 'IDLE_READY'
    case 'cutter':
      return 'IDLE_READY'
    case 'deny_defender':
      return 'DEFENSIVE_DENY'
  }
}

function _bdwIntent(role: DecoderRole): AnimationIntent {
  switch (role) {
    case 'cutter':
      return 'BACK_CUT'
    case 'deny_defender':
      return 'DEFENSIVE_DENY'
    case 'passer':
      return 'PASS_FOLLOWTHROUGH'
    // safe defaults
    case 'receiver':
      return 'RECEIVE_READY'
    case 'open_player':
      return 'IDLE_READY'
    case 'helper_defender':
      return 'DEFENSIVE_HELP_TURN'
    case 'closeout_defender':
      return 'CLOSEOUT'
  }
}

function _escIntent(role: DecoderRole): AnimationIntent {
  switch (role) {
    case 'cutter':
      return 'EMPTY_SPACE_CUT'
    case 'receiver':
      return 'RECEIVE_READY'
    case 'helper_defender':
      return 'DEFENSIVE_HELP_TURN'
    // safe defaults
    case 'passer':
      return 'PASS_FOLLOWTHROUGH'
    case 'open_player':
      return 'IDLE_READY'
    case 'deny_defender':
      return 'DEFENSIVE_DENY'
    case 'closeout_defender':
      return 'CLOSEOUT'
  }
}

function _skrIntent(role: DecoderRole): AnimationIntent {
  switch (role) {
    case 'passer':
      return 'PASS_FOLLOWTHROUGH'
    case 'open_player':
      return 'SHOT_READY'
    case 'helper_defender':
      return 'DEFENSIVE_HELP_TURN'
    case 'closeout_defender':
      return 'CLOSEOUT'
    // safe defaults
    case 'receiver':
      return 'RECEIVE_READY'
    case 'cutter':
      return 'EMPTY_SPACE_CUT'
    case 'deny_defender':
      return 'DEFENSIVE_DENY'
  }
}

// ---------------------------------------------------------------------------
// Scenario role → DecoderRole derivation
// ---------------------------------------------------------------------------

/**
 * Inputs for `deriveDecoderRole`. Roughly the union of context the
 * renderer has at clip-selection time per player. All fields are
 * optional except `team` so the helper degrades gracefully for the
 * "moving but no kind" and "stationary but no decoder" cases.
 */
export interface DecoderRoleContext {
  team: SceneTeam
  /** Free-form scenario role string from ScenePlayer.role (e.g. 'wing_defender_helping'). */
  playerRole?: string
  /** Active movement kind for the current frame, if any. */
  movementKind?: SceneMovementKind
  /** True when the player has the ball at the current frame (or starts holding it). */
  hasBall?: boolean
  /** True when this is the player marked `isUser` in the scene. */
  isUser?: boolean
  /** Optional decoder family — used to disambiguate ambiguous roles. */
  decoder?: DecoderTag
}

/**
 * P2.1 — best-effort mapping from the renderer's per-player context
 * to a `DecoderRole`. Returns `undefined` when context is too thin to
 * pick a role with confidence; the caller is expected to fall through
 * to the movement-kind path in that case.
 *
 * Rules in priority order:
 *   1. Movement kind first — the active movement is the strongest
 *      signal. A defender doing a `closeout` is a closeout_defender;
 *      an offensive `back_cut` is a cutter; etc.
 *   2. Player role string — substring match on the free-form role
 *      ('help', 'low_man', 'deny', 'shooter', etc.). Tolerant of the
 *      varied vocabularies in the seed JSON.
 *   3. Ball possession + isUser — final tie-breakers.
 *
 * Intentionally conservative: when the rules disagree, returns
 * `undefined` rather than guess. New role strings are easy to add by
 * extending the substring lists below — no schema change needed.
 */
export function deriveDecoderRole(ctx: DecoderRoleContext): DecoderRole | undefined {
  const { team, playerRole, movementKind, hasBall, isUser, decoder } = ctx
  const role = (playerRole ?? '').toLowerCase()

  // 1. Movement kind dominates when present.
  if (team === 'defense') {
    if (movementKind === 'closeout') return 'closeout_defender'
    if (movementKind === 'rotation') return 'helper_defender'
  } else {
    if (movementKind === 'back_cut') return 'cutter'
    if (movementKind === 'baseline_sneak') return 'cutter'
    if (movementKind === 'pass' || movementKind === 'skip_pass') return 'passer'
    if (movementKind === 'cut') {
      // Generic 'cut' — disambiguate by decoder family.
      if (decoder === 'BACKDOOR_WINDOW') return 'cutter'
      if (decoder === 'EMPTY_SPACE_CUT') return 'cutter'
      return 'cutter'
    }
  }

  // 2. Role-string substring matching.
  if (team === 'defense') {
    if (role.includes('help') || role.includes('low_man') || role.includes('tag')) {
      return 'helper_defender'
    }
    if (role.includes('deny') || role.includes('denying')) {
      return 'deny_defender'
    }
    if (role.includes('on_ball') || role.includes('closeout')) {
      // 'on_ball' defenders are closeout candidates when the ball
      // moves toward their assignment; absent that signal we treat
      // them as helper-eligible.
      return 'closeout_defender'
    }
  } else {
    if (role.includes('shooter') || role.includes('wing_shooter')) {
      // Open-shot vocabulary: AOR uses "wing_shooter" for the receiver,
      // SKR/ESC use it for the open_player. Disambiguate by decoder.
      if (decoder === 'ADVANTAGE_OR_RESET') return 'receiver'
      if (decoder === 'SKIP_THE_ROTATION') return 'open_player'
      return 'receiver'
    }
    if (role.includes('ball_handler') || hasBall) {
      return 'passer'
    }
    if (role.includes('corner') || role.includes('wing')) {
      // Off-ball wings/corners default to open_player (catch-and-shoot).
      return 'open_player'
    }
  }

  // 3. Final tie-breakers.
  if (team === 'offense' && isUser && decoder === 'ADVANTAGE_OR_RESET') {
    return 'receiver'
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Movement-kind → intent mapping
// ---------------------------------------------------------------------------

/**
 * Maps a scene movement kind + team side to an AnimationIntent.
 *
 * Optional `decoder` / `role` parameters allow the caller to refine
 * the intent when both a movement kind AND decoder context are
 * available (e.g. a 'cut' in BDW context resolves to BACK_CUT rather
 * than EMPTY_SPACE_CUT).
 */
export function getMovementKindIntent(
  kind: SceneMovementKind,
  team: SceneTeam,
  decoder?: DecoderTag,
  role?: DecoderRole,
): AnimationIntent {
  // If full decoder+role context is supplied, prefer the semantic path.
  if (decoder != null && role != null) {
    return getDecoderAnimationIntent(decoder, role)
  }

  // Movement-kind fallback table.
  switch (kind) {
    case 'closeout':
      return 'CLOSEOUT'

    case 'back_cut':
      return 'BACK_CUT'

    case 'cut':
    case 'baseline_sneak':
      // Offensive cuts default to EMPTY_SPACE_CUT; decoder context
      // can override to BACK_CUT upstream.
      return team === 'offense' ? 'EMPTY_SPACE_CUT' : 'DEFENSIVE_HELP_TURN'

    case 'drive':
      return team === 'offense' ? 'EMPTY_SPACE_CUT' : 'DEFENSIVE_HELP_TURN'

    case 'pass':
    case 'skip_pass':
      return 'PASS_FOLLOWTHROUGH'

    case 'rip':
    case 'jab':
      return 'JAB_OR_RIP'

    case 'rotation':
      return team === 'defense' ? 'DEFENSIVE_HELP_TURN' : 'IDLE_READY'

    case 'stop_ball':
      return 'DEFENSIVE_DENY'

    case 'lift':
    case 'drift':
      return 'RECEIVE_READY'

    default:
      return 'IDLE_READY'
  }
}

// ---------------------------------------------------------------------------
// Intent → GLB clip resolver
// ---------------------------------------------------------------------------

/**
 * GLB clip names available in the current codebase.  Mirrors
 * `GlbAthleteAnimationName` in `glbAthlete.ts` but kept as a local
 * type here so this module stays free of THREE.js imports.
 */
export type GlbClipName = 'idle_ready' | 'cut_sprint' | 'defense_slide' | 'closeout'

export interface IntentClipFlags {
  /** True when `USE_IMPORTED_CLOSEOUT_CLIP` is active. */
  importedCloseoutActive: boolean
}

/**
 * Resolves an AnimationIntent to the best available GLB clip name.
 *
 * Rules:
 *   - CLOSEOUT  → 'closeout' only when `importedCloseoutActive`;
 *                 otherwise falls back to 'defense_slide'.
 *   - Offensive moving intents → 'cut_sprint'.
 *   - Defensive moving intents → 'defense_slide'.
 *   - Stationary/unknown → 'idle_ready'.
 *
 * This is the single place that encodes clip availability. When a new
 * imported clip lands, add a flag to `IntentClipFlags` and a branch
 * here — no other code needs to change.
 */
export function resolveGlbClipForIntent(
  intent: AnimationIntent,
  flags: IntentClipFlags,
): GlbClipName {
  switch (intent) {
    case 'CLOSEOUT':
      return flags.importedCloseoutActive ? 'closeout' : 'defense_slide'

    case 'BACK_CUT':
    case 'EMPTY_SPACE_CUT':
    case 'JAB_OR_RIP':
    case 'RECEIVE_READY':
    case 'SHOT_READY':
    case 'PASS_FOLLOWTHROUGH':
    case 'RESET_HOLD':
      // Offensive / neutral moving intents — best available is
      // cut_sprint until dedicated clips land.
      return 'cut_sprint'

    case 'DEFENSIVE_DENY':
    case 'DEFENSIVE_HELP_TURN':
    case 'SLIDE_RECOVER':
      return 'defense_slide'

    case 'IDLE_READY':
      return 'idle_ready'
  }
}
