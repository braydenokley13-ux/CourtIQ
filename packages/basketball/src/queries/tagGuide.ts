import type { Point2, WorldFrame } from '../domain/types'
import type { HighPnrRecipeDefinition, LabConfig, TeamAnswer } from '../content/highPnr/types'
export interface TagGuide {
  defenderId: string
  home: Point2
  commit: Point2
  currentTarget: Point2
  tagDepth: number
  mode: 'tag' | 'prepare' | 'released' | 'unavailable'
  editable: boolean
  reason: string
}
const clampDepth = (d: number) => Math.max(0, Math.min(1, d))
/** Hero projection of exact committed policy output. This never evaluates another observation. */
export function getTagGuide(
  frame: WorldFrame,
  _answer: TeamAnswer,
  problem: HighPnrRecipeDefinition,
  _config: LabConfig,
): TagGuide {
  const defenderId = problem.roles.lowMan,
    primary = frame.responsibilities
      .filter((r) => r.defenderId === defenderId)
      .sort((a, b) => b.priority - a.priority)[0],
    rail = frame.policyEvaluations
      .flatMap((p) => p.parameterTargets)
      .find((r) => r.actorId === defenderId && r.parameterId === 'defense.tagDepth' && r.obligationId === primary?.id),
    defender = frame.players.find((p) => p.id === defenderId),
    point = primary?.target ?? { x: defender?.x ?? 0, z: defender?.z ?? 1.575 },
    depth = clampDepth(Number(frame.parameterValues['defense.tagDepth'] ?? 0)),
    editable = rail?.editable ?? false,
    enabled = frame.parameterValues['defense.tag'] === true && frame.parameterValues['defense.coverage'] !== 'switch'
  return {
    defenderId,
    home: { ...(rail?.lower ?? point) },
    commit: { ...(rail?.upper ?? point) },
    currentTarget: { ...(rail?.current ?? point) },
    tagDepth: depth,
    editable,
    mode: editable ? (primary?.kind === 'tag' ? 'tag' : 'prepare') : enabled ? 'released' : 'unavailable',
    reason: rail?.reason ?? 'This committed responsibility has no editable tag-depth rail.',
  }
}
export function tagDepthFromFloorPoint(
  guide: Pick<TagGuide, 'home' | 'commit' | 'tagDepth' | 'editable'>,
  point: Point2,
): number {
  const dx = guide.commit.x - guide.home.x,
    dz = guide.commit.z - guide.home.z,
    length = dx * dx + dz * dz
  if (!guide.editable || length < 1e-12 || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return guide.tagDepth
  return clampDepth(((point.x - guide.home.x) * dx + (point.z - guide.home.z) * dz) / length)
}
