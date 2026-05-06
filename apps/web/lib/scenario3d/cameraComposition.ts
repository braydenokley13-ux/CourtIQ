/**
 * V2-C — Camera Composition Emphasis.
 *
 * Pure helpers that decide which players the camera should keep inside
 * the safe area for a given (decoder, replay phase, scene) tuple. The
 * existing `computeAutoTarget` math frames whatever it is given; this
 * module lets the caller decide what to give it so the freeze and
 * replay frames lead with the right read.
 *
 * Two surfaces:
 *
 *   - `pickEmphasisPlayerIds(scene, decoder, phase)` — returns the
 *     player ids that must stay in the camera's safe area. Falls back
 *     to "the user + the ball-handler" when the decoder is unknown.
 *
 *   - `computeFramingWeights(scene, decoder, phase)` — returns a
 *     per-player weight map the caller can use to weight Box3
 *     contributions when fitting an aspect-aware bounding volume.
 *     Anchor players get a 1.0 weight; supports get 0.6; bystanders
 *     get 0.0 (excluded from the fit).
 *
 * Hard contract:
 *   - Pure / deterministic.
 *   - Always returns a non-empty id list when at least one player is
 *     in the scene.
 *   - SSR-safe.
 */

import type { Scene3D } from './scene'
import type { DecoderTag } from './schema'
import type { ReplayPhase } from '@/components/scenario3d/ScenarioReplayController'

export interface PlayerFramingWeight {
  playerId: string
  weight: number
  role: 'user' | 'key-defender' | 'ball-handler' | 'supporting' | 'bystander'
}

/**
 * Returns the ordered list of player ids the camera should keep in
 * frame for the given decoder + phase. Always non-empty when the
 * scene has at least one player.
 *
 * Order matters: the first id is the primary subject (typically the
 * user); later ids are the secondary anchors (key defender, helper,
 * receiver) the camera should ALSO keep visible.
 */
export function pickEmphasisPlayerIds(
  scene: Scene3D,
  decoder: DecoderTag | null,
  phase: ReplayPhase,
): string[] {
  const userId = scene.players.find((p) => p.isUser)?.id ?? null
  const ballHandlerId = scene.ball.holderId ?? null
  const ids: string[] = []
  if (userId) ids.push(userId)
  if (ballHandlerId && ballHandlerId !== userId) ids.push(ballHandlerId)

  if (decoder && (phase === 'frozen' || phase === 'replaying' || phase === 'cueRepaint')) {
    const keyDefender = pickKeyDefender(scene, decoder)
    if (keyDefender && !ids.includes(keyDefender)) ids.push(keyDefender)
  }
  // Always include at least one offense player so framing has
  // multiple anchors. Picks the closest non-user offense player to
  // the user as a fallback.
  if (ids.length === 1) {
    const otherOffense = scene.players.find(
      (p) => p.team === 'offense' && p.id !== userId,
    )
    if (otherOffense) ids.push(otherOffense.id)
  }
  return ids
}

/**
 * Returns a weight map the caller can use to bias an aspect-aware
 * bounding volume. The user gets weight 1.0; the key defender 0.9;
 * the ball-handler 0.85; secondary supports 0.55; bystanders 0.0.
 *
 * Pure / deterministic. SSR-safe.
 */
export function computeFramingWeights(
  scene: Scene3D,
  decoder: DecoderTag | null,
  phase: ReplayPhase,
): PlayerFramingWeight[] {
  const userId = scene.players.find((p) => p.isUser)?.id ?? null
  const ballHandlerId = scene.ball.holderId ?? null
  const keyDefenderId =
    decoder && (phase === 'frozen' || phase === 'replaying' || phase === 'cueRepaint')
      ? pickKeyDefender(scene, decoder)
      : null

  return scene.players.map<PlayerFramingWeight>((p) => {
    if (p.id === userId) return { playerId: p.id, weight: 1, role: 'user' }
    if (p.id === keyDefenderId) {
      return { playerId: p.id, weight: 0.9, role: 'key-defender' }
    }
    if (p.id === ballHandlerId) {
      return { playerId: p.id, weight: 0.85, role: 'ball-handler' }
    }
    // Supporting offense / nearby defenders get a partial weight.
    if (p.team === 'offense') {
      return { playerId: p.id, weight: 0.55, role: 'supporting' }
    }
    return { playerId: p.id, weight: 0, role: 'bystander' }
  })
}

/**
 * Decoder-aware key-defender heuristic. Mirrors the FR-3 §7.3
 * closest-defender pick used elsewhere but stays decoder-aware so
 * SKR (help defense) prefers the over-helper rather than the on-ball
 * defender.
 *
 * Returns null when the scene has no defenders.
 */
function pickKeyDefender(
  scene: Scene3D,
  decoder: DecoderTag,
): string | null {
  const defenders = scene.players.filter((p) => p.team === 'defense')
  if (defenders.length === 0) return null
  const userId = scene.players.find((p) => p.isUser)?.id ?? null
  const user = userId ? scene.players.find((p) => p.id === userId) : null
  const userPos = user?.start ?? null

  // SKR — pick the help defender (the one farthest from the user but
  // closest to the rim corridor). The renderer's existing teaching
  // overlay already targets the over-helper; this mirrors that
  // semantic without re-running the simulation.
  if (decoder === 'SKIP_THE_ROTATION') {
    if (!userPos) return defenders[0]!.id
    let farthest = defenders[0]!
    let maxDist = -1
    for (const d of defenders) {
      const dx = d.start.x - userPos.x
      const dz = d.start.z - userPos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > maxDist) {
        maxDist = dist
        farthest = d
      }
    }
    return farthest.id
  }

  // BDW / ESC / AOR — closest defender to the user. This is the
  // closeout / denial / help-on-cut pattern.
  if (!userPos) return defenders[0]!.id
  let closest = defenders[0]!
  let minDist = Number.POSITIVE_INFINITY
  for (const d of defenders) {
    const dx = d.start.x - userPos.x
    const dz = d.start.z - userPos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < minDist) {
      minDist = dist
      closest = d
    }
  }
  return closest.id
}
