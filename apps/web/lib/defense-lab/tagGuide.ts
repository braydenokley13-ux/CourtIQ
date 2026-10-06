import { defenseResponsibilities, type DefensePolicyState } from './defensivePolicy'
import { opponentAt } from './offensivePolicy'
import type { LabConfig, PlayerId, Point2, ProblemDefinition, TeamAnswer, WorldFrame } from './types'

export interface TagGuide {
  defenderId: PlayerId
  /** The same policy evaluated at zero and full commitment. These are targets,
   * never promises that a moving defender can arrive there immediately. */
  home: Point2
  commit: Point2
  currentTarget: Point2
  tagDepth: number
  mode: 'tag' | 'prepare' | 'released' | 'unavailable'
  editable: boolean
  reason: string
}

const clampDepth = (depth: number) => Math.max(0, Math.min(1, depth))

/** Evaluate the real defensive policy on the frozen observation. In particular,
 * preparation has a different rail from an active tag, and an exchanged or
 * released assignment must never acquire an invented draggable tag target.
 * The renderer consumes these points; it owns no basketball target formula. */
export function getTagGuide(frame: WorldFrame, answer: TeamAnswer, problem: ProblemDefinition, config: LabConfig): TagGuide {
  const defenderId = problem.roles.lowMan
  const defender = frame.players.find(p => p.id === defenderId)!
  const resolve = (depth: number) => {
    // Each query gets its own state because the policy may observe show recovery.
    const state: DefensePolicyState | undefined = opponentAt(config, frame.t)
      ? { screenAt: frame.screenEngagedAt ?? null, showReleased: false }
      : undefined
    return defenseResponsibilities(frame, { ...answer, tagDepth: depth }, problem, config, frame.t, state)
      .filter(r => r.defenderId === defenderId)
      .sort((a, b) => b.priority - a.priority)[0]
  }
  const depth = clampDepth(answer.tagDepth)
  const current = resolve(depth), start = resolve(0), end = resolve(1)
  const currentTarget = current ? { ...current.target } : { x: defender.x, z: defender.z }
  const home = start ? { ...start.target } : { ...currentTarget }
  const commit = end ? { ...end.target } : { ...currentTarget }
  const sameObligation = !!current && !!start && !!end && current.id === start.id && current.id === end.id
  const depthSensitive = Math.hypot(commit.x - home.x, commit.z - home.z) > 1e-6
  const editable = answer.coverage !== 'switch' && sameObligation && depthSensitive
  const mode = editable ? current!.kind === 'tag' ? 'tag' : 'prepare'
    : !answer.tag || answer.coverage === 'switch' || !problem.actions.some(a => a.kind === 'screen') ? 'unavailable' : 'released'
  const reason = editable
    ? mode === 'tag' ? 'Drag the tag target between home and full commitment.' : 'Drag the preparation target; the active tag follows the roller.'
    : answer.coverage === 'switch' ? 'The screen defenders own the exchange; the low man has no tag.'
      : !answer.tag ? 'Enable the low-man tag to set its depth.'
        : !problem.actions.some(a => a.kind === 'screen') ? 'This possession has no screen tag.'
          : 'The current responsibility has no tag-depth target. Freeze before its release to edit on the floor.'
  return { defenderId, home, commit, currentTarget, tagDepth: depth, mode, editable, reason }
}

/** Nearest point on the executable commitment rail. Off-rail dragging changes
 * only depth; it cannot smuggle an arbitrary movement cue into the team rule. */
export function tagDepthFromFloorPoint(guide: Pick<TagGuide, 'home' | 'commit' | 'tagDepth' | 'editable'>, point: Point2): number {
  const dx = guide.commit.x - guide.home.x, dz = guide.commit.z - guide.home.z
  const lengthSquared = dx * dx + dz * dz
  if (!guide.editable || lengthSquared < 1e-12 || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return guide.tagDepth
  return clampDepth(((point.x - guide.home.x) * dx + (point.z - guide.home.z) * dz) / lengthSquared)
}
