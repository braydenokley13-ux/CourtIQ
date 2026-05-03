/**
 * P3.0 — Decoder overlay preset map.
 *
 * For each founder decoder (BDW / AOR / ESC / SKR), this module describes
 * the canonical authored-overlay recipe a scenario in that family is
 * expected to use:
 *
 *   - the **pre-answer cue cluster** (shown at the freeze; cue, not
 *     answer; gated by `PRE_ANSWER_OVERLAY_KINDS`)
 *   - the **post-answer reveal** (shown during best-read replay; may
 *     reveal lanes, open space, action arrows, timing pulses)
 *   - per-decoder clutter caps for beginner / intermediate / advanced reps
 *
 * The map is data, not policy:
 *   - The renderer never reaches into this map at runtime. Every
 *     scenario authors its own `preAnswerOverlays` / `postAnswerOverlays`
 *     so changes are explicit and reviewable.
 *   - Authors and tests use the map as a checklist + reference recipe.
 *   - The preset references *templates* (no concrete player ids); a
 *     scenario authoring a preset substitutes its own ids.
 *
 * Architecture lock:
 *   - Pure data + types. No THREE.js, no runtime side effects.
 *   - Same inputs always produce the same outputs (frozen objects).
 *   - All preset entries use only kinds defined in
 *     `apps/web/lib/scenario3d/schema.ts`.
 */

import type { DecoderTag, OverlayPrimitive } from './schema'
import { isAllowedPreAnswerOverlay } from './schema'

// ---------------------------------------------------------------------------
// Clutter caps. Codify Section 7 of `phase-p-film-room-animation-architecture.md`
// and Section 5 of `phase-p3-teaching-overlays.md`.
//
// "Cluster" = the set of overlays mounted simultaneously inside one phase
// (pre or post). Authors are expected to keep beginner founder scenarios
// at or below the beginner cap. The intermediate / advanced caps exist so
// the architecture can grow with the curriculum without re-writing the
// renderer.
// ---------------------------------------------------------------------------

/** Beginner: one main cue + one helper cue + one anchor (focus or label). */
export const MAX_FREEZE_OVERLAYS_BEGINNER = 3

/** Beginner replay: one open-space + one action arrow + one supporting body cue. */
export const MAX_REPLAY_OVERLAYS_BEGINNER = 3

/** Intermediate: lets a scenario reveal a second-read cue. */
export const MAX_OVERLAYS_INTERMEDIATE = 4

/** Advanced: chained-decision scenarios may layer a next-rotation cue. */
export const MAX_OVERLAYS_ADVANCED = 5

export type DifficultyTier = 'beginner' | 'intermediate' | 'advanced'

/**
 * Returns the clutter cap for a given phase + difficulty tier.
 *
 * Pre-answer ("freeze") clusters are the strictest because the player is
 * reading the cue under decision pressure. Post-answer ("replay") clusters
 * are slightly more permissive because the player has already chosen.
 */
export function getOverlayClutterCap(
  phase: 'pre' | 'post',
  tier: DifficultyTier,
): number {
  if (tier === 'beginner') {
    return phase === 'pre'
      ? MAX_FREEZE_OVERLAYS_BEGINNER
      : MAX_REPLAY_OVERLAYS_BEGINNER
  }
  if (tier === 'intermediate') return MAX_OVERLAYS_INTERMEDIATE
  return MAX_OVERLAYS_ADVANCED
}

// ---------------------------------------------------------------------------
// Preset templates. Each entry is a "recipe" of overlay primitives with
// **role-tagged player references** rather than scenario-specific player
// ids. Authors substitute their own ids when applying the preset.
//
// We intentionally do NOT use the typed `OverlayPrimitive` shape for the
// template — a preset references roles like "deny_defender", not concrete
// player ids like "x2". `applyOverlayPreset` resolves roles → ids and
// emits validated `OverlayPrimitive` objects.
// ---------------------------------------------------------------------------

/**
 * The roles a preset may reference. Mirrors `DecoderRole` from
 * `animationIntent.ts` but kept as its own narrow type so the preset map
 * does not depend on the animation-intent module. The two types are
 * compatible (every value here is a valid `DecoderRole`).
 */
export type PresetRole =
  | 'cutter'
  | 'passer'
  | 'receiver'
  | 'open_player'
  | 'deny_defender'
  | 'closeout_defender'
  | 'helper_defender'
  | 'on_ball_defender'
  | 'low_man'
  | 'decision_maker'

/**
 * Preset overlay template — like `OverlayPrimitive` but with role-typed
 * references instead of concrete player ids. `anchor` is a logical zone
 * keyword; the author resolves it to court coordinates per scenario.
 */
export type PresetOverlay =
  | { kind: 'defender_vision_cone'; player: PresetRole; target?: PresetRole }
  | { kind: 'defender_hip_arrow'; player: PresetRole }
  | { kind: 'defender_foot_arrow'; player: PresetRole }
  | { kind: 'defender_chest_line'; player: PresetRole }
  | { kind: 'defender_hand_in_lane'; player: PresetRole }
  | {
      kind: 'help_pulse'
      player: PresetRole
      role: 'tag' | 'low_man' | 'nail' | 'stunter' | 'overhelp'
    }
  | { kind: 'open_space_region'; anchor: 'rim' | 'shooting_pocket' | 'vacated_paint' | 'weak_side' | 'attack_lane' }
  | { kind: 'passing_lane_open'; from: PresetRole | 'ball'; to: PresetRole }
  | { kind: 'passing_lane_blocked'; from: PresetRole | 'ball'; to: PresetRole }
  | {
      kind: 'drive_cut_preview'
      player: PresetRole
      pathDescription: string
    }
  | { kind: 'timing_pulse'; anchor: 'shooting_pocket' | 'pass_window' | 'cut_window' }
  | { kind: 'label'; anchor: 'cue' | 'space' | 'action'; text: string }

export interface DecoderOverlayPreset {
  decoder: DecoderTag
  label: string
  /** Plain-English teaching beat — what the freeze should communicate. */
  beat: {
    whatChanged: string
    whatSpaceOpened: string
    whatIsBestRead: string
    whatIsNextBest: string
  }
  /** The cue cluster shown at freeze. Must use only kinds in
   *  `PRE_ANSWER_OVERLAY_KINDS`. */
  preAnswer: readonly PresetOverlay[]
  /** The reveal shown during best-read replay. Any kind is allowed. */
  postAnswer: readonly PresetOverlay[]
  /** Default difficulty tier for a founder rep authored against this
   *  preset. Authors can override per scenario; the tier drives the
   *  clutter cap that authoring tests apply. */
  defaultTier: DifficultyTier
}

const BACKDOOR_WINDOW: DecoderOverlayPreset = {
  decoder: 'BACKDOOR_WINDOW',
  label: 'Backdoor Window',
  beat: {
    whatChanged: 'The wing defender stepped into the passing lane.',
    whatSpaceOpened: 'The space behind the defender, between him and the rim.',
    whatIsBestRead: 'Cut behind him to the front of the rim; the passer leads you to the layup.',
    whatIsNextBest: 'V-cut out to a deeper catch point — keep possession, lose the layup.',
  },
  preAnswer: [
    { kind: 'defender_vision_cone', player: 'deny_defender', target: 'passer' },
    { kind: 'defender_hip_arrow', player: 'deny_defender' },
    { kind: 'defender_hand_in_lane', player: 'deny_defender' },
  ],
  postAnswer: [
    { kind: 'passing_lane_blocked', from: 'passer', to: 'cutter' },
    { kind: 'open_space_region', anchor: 'rim' },
    { kind: 'drive_cut_preview', player: 'cutter', pathDescription: 'wing → plant outside foot → behind defender → rim' },
  ],
  defaultTier: 'beginner',
}

const ADVANTAGE_OR_RESET: DecoderOverlayPreset = {
  decoder: 'ADVANTAGE_OR_RESET',
  label: 'Advantage or Reset',
  beat: {
    whatChanged: 'Your defender was helping in the paint and is closing out late.',
    whatSpaceOpened: 'The shooting pocket — closeout cushion is short, hands are not yet up.',
    whatIsBestRead: 'Catch in pocket and rise immediately; the closeout cannot beat the ball.',
    whatIsNextBest: 'If the closeout is flying past, rip and drive the cushion side; reset only if no advantage.',
  },
  preAnswer: [
    { kind: 'defender_vision_cone', player: 'closeout_defender', target: 'receiver' },
    { kind: 'defender_hip_arrow', player: 'closeout_defender' },
    { kind: 'defender_foot_arrow', player: 'closeout_defender' },
  ],
  postAnswer: [
    { kind: 'open_space_region', anchor: 'shooting_pocket' },
    { kind: 'timing_pulse', anchor: 'shooting_pocket' },
    { kind: 'drive_cut_preview', player: 'receiver', pathDescription: 'catch → attack baseline cushion side' },
  ],
  defaultTier: 'beginner',
}

const EMPTY_SPACE_CUT: DecoderOverlayPreset = {
  decoder: 'EMPTY_SPACE_CUT',
  label: 'Empty-Space Cut',
  beat: {
    whatChanged: 'The helper rotated to the ball — your area is now empty.',
    whatSpaceOpened: 'The vacated paint between the helper and the rim.',
    whatIsBestRead: 'Cut into the empty space; passer hits you in stride.',
    whatIsNextBest: 'If the helper recovers, lift to the elbow and re-screen — keep the advantage.',
  },
  preAnswer: [
    { kind: 'defender_vision_cone', player: 'helper_defender', target: 'passer' },
    { kind: 'defender_hip_arrow', player: 'helper_defender' },
    { kind: 'help_pulse', player: 'helper_defender', role: 'tag' },
  ],
  postAnswer: [
    { kind: 'open_space_region', anchor: 'vacated_paint' },
    { kind: 'passing_lane_open', from: 'passer', to: 'cutter' },
    { kind: 'drive_cut_preview', player: 'cutter', pathDescription: 'cutter → empty paint, hands ready' },
  ],
  defaultTier: 'beginner',
}

const SKIP_THE_ROTATION: DecoderOverlayPreset = {
  decoder: 'SKIP_THE_ROTATION',
  label: 'Skip the Rotation',
  beat: {
    whatChanged: 'Help over-rotated to the strong side.',
    whatSpaceOpened: 'Weak-side advantage — one defender is guarding two players.',
    whatIsBestRead: 'Skip the rotation — pass weak side to the open shooter.',
    whatIsNextBest: 'If the closeout recovers, swing one-more to the corner for the cleaner shot.',
  },
  preAnswer: [
    { kind: 'help_pulse', player: 'helper_defender', role: 'overhelp' },
    { kind: 'defender_hip_arrow', player: 'helper_defender' },
    { kind: 'defender_chest_line', player: 'helper_defender' },
  ],
  postAnswer: [
    { kind: 'passing_lane_open', from: 'passer', to: 'open_player' },
    { kind: 'open_space_region', anchor: 'weak_side' },
    { kind: 'drive_cut_preview', player: 'open_player', pathDescription: 'catch → shoot, or one-more to corner' },
  ],
  defaultTier: 'beginner',
}

/**
 * Per-decoder overlay preset map. Frozen at module load.
 */
export const DECODER_OVERLAY_PRESETS: Readonly<
  Record<DecoderTag, DecoderOverlayPreset>
> = Object.freeze({
  BACKDOOR_WINDOW,
  ADVANTAGE_OR_RESET,
  EMPTY_SPACE_CUT,
  SKIP_THE_ROTATION,
})

/** Convenience accessor — same shape as a Map.get with a clean fallback. */
export function getDecoderOverlayPreset(
  decoder: DecoderTag,
): DecoderOverlayPreset {
  return DECODER_OVERLAY_PRESETS[decoder]
}

// ---------------------------------------------------------------------------
// Authoring helpers. The preset templates use role-typed references; an
// author resolves roles → ids using their scenario's player table. The
// helpers below are pure (no mutation, no I/O) and emit `OverlayPrimitive`
// objects that the schema validates.
// ---------------------------------------------------------------------------

export interface RoleResolutionMap {
  /** Map of preset role → scenario player id. The author owns this
   *  mapping; missing roles cause `applyOverlayPreset` to skip the
   *  primitive rather than throw, so a scenario that doesn't have a
   *  `helper_defender` simply gets no help-pulse overlay. */
  roleToPlayerId: Partial<Record<PresetRole, string>>
  /** Court coordinates for each named anchor a preset references. */
  anchorToPoint: Partial<Record<
    'rim' | 'shooting_pocket' | 'vacated_paint' | 'weak_side' | 'attack_lane'
    | 'pass_window' | 'cut_window' | 'cue' | 'space' | 'action',
    { x: number; z: number }
  >>
  /** Optional explicit drive-preview paths per role; if the author
   *  doesn't supply one, the primitive is skipped. */
  drivePreviewPathByRole?: Partial<Record<PresetRole, ReadonlyArray<{ x: number; z: number }>>>
  /** Optional explicit timing-pulse durations by anchor. Defaults to
   *  600ms when an anchor is referenced but no duration is supplied. */
  timingPulseDurationMsByAnchor?: Partial<Record<
    'shooting_pocket' | 'pass_window' | 'cut_window',
    number
  >>
}

const DEFAULT_TIMING_PULSE_MS = 600

/**
 * Resolves a role reference. Returns null when the role isn't mapped or
 * when `value` is the literal "ball" (a passing-lane endpoint that is
 * already a valid id at the schema layer).
 */
function resolvePlayerRef(
  value: PresetRole | 'ball',
  map: RoleResolutionMap,
): string | null {
  if (value === 'ball') return 'ball'
  return map.roleToPlayerId[value] ?? null
}

/**
 * Compiles a preset into the validated, scenario-specific `OverlayPrimitive`
 * arrays the renderer consumes. Pure — same inputs always produce the
 * same outputs. Skips a primitive when its role / anchor / path is
 * missing from the resolution map; surfaces the skipped count for QA.
 */
export function applyOverlayPreset(
  preset: DecoderOverlayPreset,
  map: RoleResolutionMap,
): {
  preAnswer: OverlayPrimitive[]
  postAnswer: OverlayPrimitive[]
  skipped: number
} {
  let skipped = 0

  const compile = (templates: readonly PresetOverlay[]): OverlayPrimitive[] => {
    const out: OverlayPrimitive[] = []
    for (const t of templates) {
      switch (t.kind) {
        case 'defender_vision_cone': {
          const playerId = resolvePlayerRef(t.player, map)
          if (!playerId || playerId === 'ball') {
            skipped++
            continue
          }
          const targetId = t.target
            ? resolvePlayerRef(t.target, map) ?? undefined
            : undefined
          out.push({
            kind: 'defender_vision_cone',
            playerId,
            ...(targetId && targetId !== 'ball' ? { targetId } : {}),
          })
          break
        }
        case 'defender_hip_arrow':
        case 'defender_foot_arrow':
        case 'defender_chest_line':
        case 'defender_hand_in_lane': {
          const playerId = resolvePlayerRef(t.player, map)
          if (!playerId || playerId === 'ball') {
            skipped++
            continue
          }
          out.push({ kind: t.kind, playerId })
          break
        }
        case 'help_pulse': {
          const playerId = resolvePlayerRef(t.player, map)
          if (!playerId || playerId === 'ball') {
            skipped++
            continue
          }
          out.push({ kind: 'help_pulse', playerId, role: t.role })
          break
        }
        case 'open_space_region': {
          const point = map.anchorToPoint[t.anchor]
          if (!point) {
            skipped++
            continue
          }
          out.push({ kind: 'open_space_region', anchor: point, radiusFt: 4 })
          break
        }
        case 'passing_lane_open':
        case 'passing_lane_blocked': {
          const from = resolvePlayerRef(t.from, map)
          const to = resolvePlayerRef(t.to, map)
          if (!from || !to || to === 'ball') {
            skipped++
            continue
          }
          out.push({ kind: t.kind, from, to })
          break
        }
        case 'drive_cut_preview': {
          const playerId = resolvePlayerRef(t.player, map)
          const path = map.drivePreviewPathByRole?.[t.player]
          if (!playerId || playerId === 'ball' || !path || path.length < 2) {
            skipped++
            continue
          }
          out.push({
            kind: 'drive_cut_preview',
            playerId,
            path: path.map((p) => ({ x: p.x, z: p.z })),
          })
          break
        }
        case 'timing_pulse': {
          const point = map.anchorToPoint[t.anchor]
          if (!point) {
            skipped++
            continue
          }
          const durationMs =
            map.timingPulseDurationMsByAnchor?.[t.anchor] ?? DEFAULT_TIMING_PULSE_MS
          out.push({ kind: 'timing_pulse', anchor: point, durationMs })
          break
        }
        case 'label': {
          const point = map.anchorToPoint[t.anchor]
          if (!point) {
            skipped++
            continue
          }
          out.push({ kind: 'label', anchor: point, text: t.text })
          break
        }
      }
    }
    return out
  }

  return {
    preAnswer: compile(preset.preAnswer),
    postAnswer: compile(preset.postAnswer),
    skipped,
  }
}

/**
 * Sanity check: every kind in a preset's preAnswer cluster must be in the
 * schema's pre-answer allow-list. Used by the preset map's invariant
 * test; not called at runtime.
 */
export function presetPreAnswerKindsAreAllAllowed(
  preset: DecoderOverlayPreset,
): boolean {
  for (const t of preset.preAnswer) {
    if (!isAllowedPreAnswerOverlay(t.kind)) return false
  }
  return true
}
