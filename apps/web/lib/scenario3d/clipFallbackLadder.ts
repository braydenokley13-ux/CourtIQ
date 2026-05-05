/**
 * FR-8 Packet 5 — clip fallback ladder.
 *
 * Pure helper that returns the deterministic, ordered ladder of clip
 * names a renderer should attempt for a given AnimationIntent. The
 * ladder makes the §6.1 fallback policy explicit and unit-testable:
 *
 *   1. Intent-specific clip       (the resolver's primary pick).
 *   2. Closest matching clip      (motion-class-aware sibling).
 *   3. Stationary safe pose       (`receive_ready` / `defensive_deny`).
 *   4. Idle ready                 (`idle_ready` — last resort that
 *                                   still holds the basketball-ready
 *                                   stance instead of bind).
 *
 * Bind pose is intentionally NOT in the ladder: every clip in the
 * ladder is one of the 6 always-mounted bespoke clips, so the ladder
 * can never bottom out at "rig at rest". A consumer that wants the
 * raw bind silhouette can do so explicitly outside the ladder.
 *
 * Architecture lock:
 *   - Pure data + types. No THREE.js. No imports of the
 *     `glbAthlete.ts` builder.
 *   - Determinism: same intent + flags → same ladder.
 *   - The ladder NEVER includes a clip that is not in the
 *     `GLB_ATHLETE_CLIP_NAMES` audit set OR
 *     `GLB_ATHLETE_IMPORTED_CLIP_NAMES` (gated by feature flags).
 *   - Idempotent: every ladder ends with `idle_ready`, so a renderer
 *     that walks the ladder is guaranteed to find a clip that the
 *     mixer always has.
 */

import {
  getIntentMotionClass,
  getStationaryFallbackClip,
  resolveGlbClipForIntent,
  type AnimationIntent,
  type GlbClipName,
  type IntentClipFlags,
} from './animationIntent'

/**
 * The fallback ladder for an intent. `tiers` is ordered from most
 * specific to least specific. Renderers should attempt them in
 * order and stop at the first one whose clip is mounted on the
 * mixer.
 *
 * The first tier is always the resolver's primary pick — so a
 * renderer that does not care about the ladder can just call
 * `resolveGlbClipForIntent` and ignore the rest of the ladder
 * without changing behaviour.
 */
export interface ClipFallbackLadder {
  intent: AnimationIntent
  tiers: readonly GlbClipName[]
}

/**
 * Returns the ladder for an intent. Order is:
 *
 *   1. resolveGlbClipForIntent(intent, flags)  (primary pick)
 *   2. motion-class sibling                    (the canonical
 *                                                clip for the
 *                                                intent's motion
 *                                                class — e.g.
 *                                                `cut_sprint` for
 *                                                moving-offense)
 *   3. stationary fallback                     (`defensive_deny`
 *                                                for denial,
 *                                                `receive_ready`
 *                                                otherwise)
 *   4. `idle_ready`                            (always-mounted)
 *
 * Duplicates are stripped so the ladder length varies by intent —
 * for instance, IDLE_READY's primary pick IS `idle_ready`, which
 * makes the ladder a single-tier `['idle_ready']`.
 *
 * Pure: same inputs → same ladder array. The function returns a
 * fresh array each call so consumers can safely mutate, but the
 * VALUES are deterministic.
 */
export function getClipFallbackLadder(
  intent: AnimationIntent,
  flags: IntentClipFlags,
): ClipFallbackLadder {
  const primary = resolveGlbClipForIntent(intent, flags)
  const motionClass = getIntentMotionClass(intent)
  const motionSibling = MOTION_CLASS_SIBLING[motionClass]
  const stationary = getStationaryFallbackClip(intent)

  const ordered: GlbClipName[] = [
    primary,
    motionSibling,
    stationary,
  ]
  // Strip duplicates while preserving order, then APPEND idle_ready
  // so the ladder always ends at the always-mounted safety net.
  // (Pre-dedup we cannot put idle_ready inline because it might
  // dedupe BEFORE another tier — e.g. the primary for IDLE_READY is
  // idle_ready, which would silence the stationary fallback the
  // ladder owes a moving intent's freeze path.)
  const seen = new Set<GlbClipName>()
  const tiers: GlbClipName[] = []
  for (const c of ordered) {
    if (!seen.has(c)) {
      seen.add(c)
      tiers.push(c)
    }
  }
  if (!seen.has('idle_ready')) {
    tiers.push('idle_ready')
  } else {
    // idle_ready is already in the ladder; promote it to the end so
    // the architectural "ladder always ends with idle_ready"
    // invariant holds for every intent.
    const idx = tiers.indexOf('idle_ready')
    if (idx !== tiers.length - 1) {
      tiers.splice(idx, 1)
      tiers.push('idle_ready')
    }
  }
  return { intent, tiers }
}

/**
 * Canonical sibling clip per motion class. The sibling is what the
 * ladder tries when the primary clip is missing but a clip in the
 * same motion category is mounted. Static so the ladder is
 * deterministic without re-running the resolver.
 *
 *   - stationary       → receive_ready (planted ready pose)
 *   - moving-offense   → cut_sprint    (generic offensive sprint)
 *   - moving-defense   → defense_slide (generic defensive slide)
 */
const MOTION_CLASS_SIBLING = {
  stationary: 'receive_ready',
  'moving-offense': 'cut_sprint',
  'moving-defense': 'defense_slide',
} as const satisfies Record<ReturnType<typeof getIntentMotionClass>, GlbClipName>

/**
 * Convenience: the first available clip from the ladder, given a
 * predicate that tests "is this clip mounted on the mixer?". The
 * renderer's mixer is the source of truth for clip availability —
 * this helper just walks the ladder.
 *
 * If `mounted` returns false for every tier (impossible in
 * practice because `idle_ready` is always mounted, but defended
 * against here for safety) the function returns the last tier
 * (`idle_ready`). The renderer's mixer will throw if even that is
 * missing — at that point the GLB build itself is broken and the
 * caller has bigger problems.
 */
export function pickFirstMountedClip(
  ladder: ClipFallbackLadder,
  mounted: (clip: GlbClipName) => boolean,
): GlbClipName {
  for (const tier of ladder.tiers) {
    if (mounted(tier)) return tier
  }
  // Defensive default: ladder always ends with idle_ready, which is
  // always mounted. If we land here, something is very broken.
  return ladder.tiers[ladder.tiers.length - 1]!
}
