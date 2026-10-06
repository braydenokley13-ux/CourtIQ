import { DEFAULT_OPPONENT, evaluateCondition, opponentAt } from './offensivePolicy'
import { compileCoachRules } from './coachRules'
import type { LabConfig, PlayerId, PlayerState, Point2, ProblemDefinition, Responsibility, TeamAnswer, ThreatId, WorldFrame } from './types'
const rim = { x: 0, z: 1.575 }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const player = (ps: PlayerState[], id: PlayerId) => ps.find(p => p.id === id)!
const towardRim = (p: Point2, gap: number): Point2 => { const d = distance(p, rim) || 1; return { x: p.x - p.x / d * gap, z: p.z + (rim.z - p.z) / d * gap } }

/** The drop line: where the big's body sits while the ball is above him. bigDepth
 * is the depth mark in metres from the attacked baseline; the big's centre sits
 * 1.9 m past it so his chest, not his heels, is on the mark. He holds that line
 * and only steps up once the handler is within a body length of it, so a deeper
 * line concedes the pull-up space and a higher line takes it away. */
export const DROP_LINE_OFFSET = 1.9
export const dropLine = (bigDepth: number) => bigDepth + DROP_LINE_OFFSET

/** Role-based ball-screen coverage policy. Coaching rules choose obligations;
 * the independent world integrator determines physical arrival. */
export interface DefensePolicyState { screenAt: number | null; showReleased: boolean }
/** A screen encounter requires a declared screen action and observed bodies in
 * its encounter area. A baseline drive cannot turn into a timed switch. */
export function observeScreen(observed: WorldFrame, problem: ProblemDefinition, state: DefensePolicyState): void {
  const screen = problem.actions.find(a => a.kind === 'screen' && a.from <= observed.t)
  if (!screen || state.screenAt !== null) return
  const handler = player(observed.players, problem.roles.ballhandler), screener = player(observed.players, problem.roles.screener)
  if (distance(handler, screener) < 1.9 && Math.hypot(handler.vx, handler.vz) > 0.2) state.screenAt = observed.t
}
export function defenseResponsibilities(observed: WorldFrame, answer: TeamAnswer, problem: ProblemDefinition, config: LabConfig, t: number, state?: DefensePolicyState): Responsibility[] {
  const r = problem.roles, ps = observed.players, ball = observed.ball, owner = ball.phase === 'pass' ? ball.receiver : ball.owner
  const handler = player(ps, r.ballhandler), roller = player(ps, r.screener), corner = player(ps, r.weakCorner), lift = player(ps, r.weakLift), strong = player(ps, r.strongCorner)
  const responsibilities: Responsibility[] = []
  const add = (defenderId: PlayerId, threatId: ThreatId, offensivePlayerId: PlayerId, kind: Responsibility['kind'], target: Point2, trigger: string, priority = 1, dueAt?: number, sourceRuleId?: string) => responsibilities.push({ id: `${defenderId}:${threatId}:${kind}`, defenderId, threatId, offensivePlayerId, kind, target, priority, trigger, ...(sourceRuleId !== undefined ? { sourceRuleId } : {}), startedAt: t, influenceRadius: config.assumptions.contestRadius, ...(dueAt !== undefined ? { dueAt, availableAt: t } : {}) })
  const activeCarrier = player(ps, owner ?? r.ballhandler)
  const bigPlayer = player(ps, r.big)
  const ballAtHandler = owner === r.ballhandler || owner === null
  const hasScreen = problem.actions.some(a => a.kind === 'screen')
  const screenUsed = state ? state.screenAt !== null : hasScreen && observed.t >= 0.48
  const poa = player(ps, r.poa)
  if (state && state.screenAt !== null && observed.t > state.screenAt + 0.35 && (distance(poa, handler) < 1.3 && poa.z < handler.z || roller.z < 5.5)) state.showReleased = true
  const showRecover = state ? state.showReleased : observed.t >= 1.2
  const switched = answer.coverage === 'switch' && screenUsed
  if (switched) {
    add(r.big, 'drive', r.ballhandler, 'switch', towardRim(handler, 0.85), 'Screen defenders exchange')
    add(r.poa, roller.z > 7.7 && roller.vz >= 0 ? 'pop' : 'roll', r.screener, 'switch', towardRim(roller, 0.85), 'Take the screener after switch')
  } else {
    const poaTarget = ballAtHandler ? { x: handler.x + (answer.coverage === 'ice' ? -0.8 : 0.12), z: handler.z + (answer.poa === 'over' ? 0.65 : -0.85) } : towardRim(handler, 0.9)
    add(r.poa, 'drive', r.ballhandler, 'chase', poaTarget, answer.poa === 'over' ? 'Chase over the screen' : 'Go under the screen')
    let bigTarget: Point2
    if (hasScreen && answer.coverage === 'blitz' && ballAtHandler) bigTarget = { x: handler.x - 0.75, z: handler.z - 0.15 }
    else if (answer.coverage === 'hedge' && hasScreen && ballAtHandler && !showRecover) bigTarget = { x: handler.x - 0.35, z: handler.z - 0.55 }
    else if (!ballAtHandler || (answer.coverage === 'hedge' && hasScreen && showRecover)) bigTarget = towardRim(roller, 0.8)
    else bigTarget = { x: handler.x, z: Math.min(dropLine(answer.bigDepth), handler.z - 0.95) }
    if (!hasScreen) bigTarget = towardRim(roller, 0.8)
    const bigOwnsRoll = !hasScreen || !ballAtHandler || answer.coverage === 'hedge' && hasScreen && showRecover
    add(r.big, bigOwnsRoll ? roller.z > 7.7 && roller.vz >= 0 ? 'pop' : 'roll' : 'drive', bigOwnsRoll ? r.screener : r.ballhandler, answer.coverage === 'blitz' && ballAtHandler ? 'contain' : bigOwnsRoll ? 'recover' : 'contain', bigTarget, answer.coverage === 'blitz' ? 'Show two to the ball' : bigOwnsRoll ? 'Recover to the screener' : 'Contain ball and roll')
  }
  add(r.strongSide, 'strong', r.strongCorner, 'guard', towardRim(strong, 0.9), 'Protect strong-side spacing')
  const rollerThreat = roller.vz < -0.2 || roller.z < 5.5
  const passSeen = ball.phase === 'pass' || ball.phase === 'gather' || ball.phase === 'shot'
  const rollerSecured = distance(bigPlayer, roller) <= config.assumptions.contestRadius && !ballAtHandler
  const tagActive = hasScreen && answer.tag && !switched && rollerThreat && (answer.recovery === 'roller-secured' ? !rollerSecured : !passSeen)
  const tagPlanned = hasScreen && answer.tag && answer.coverage !== 'switch' && ballAtHandler && roller.vz <= 0.2
  const cornerGuard = towardRim(corner, 0.9), liftGuard = towardRim(lift, 0.9)
  const tagTarget = { x: lerp(cornerGuard.x, roller.x - 0.8, answer.tagDepth), z: lerp(cornerGuard.z, clamp(roller.z - 1.2, 2.5, 3.7), answer.tagDepth) }
  const passCorner = passSeen && owner === r.weakCorner, passLift = passSeen && owner === r.weakLift
  const earlyExchange = answer.backside === 'x-out' && answer.rotationTiming === 'early' && tagActive && answer.tagDepth > 0.45
  const exchange = answer.backside === 'x-out' && (passCorner || earlyExchange)
  if (tagActive) {
    add(r.lowMan, 'roll', r.screener, 'tag', tagTarget, 'Roller enters weakside help', 1.5)
    // Recovery remains a visible conditional commitment. A deadline only exists
    // after a real pass: simultaneous possible future passes are not obligations.
    add(r.lowMan, exchange ? 'lift' : 'corner', exchange ? r.weakLift : r.weakCorner, 'recover', exchange ? liftGuard : cornerGuard, 'Recover after the tag', 0.35, passSeen ? (ball.flight?.end ?? t) + config.assumptions.gatherTime : undefined)
  } else {
    const preparedHelp = { x: lerp(cornerGuard.x, roller.x - 0.8, answer.tagDepth * 0.65), z: lerp(cornerGuard.z, 2.8, answer.tagDepth) }
    add(r.lowMan, exchange ? 'lift' : 'corner', exchange ? r.weakLift : r.weakCorner, exchange ? 'closeout' : 'recover', exchange ? liftGuard : tagPlanned ? preparedHelp : cornerGuard, exchange ? 'Low man takes the lift' : tagPlanned ? 'Prepare weakside help without losing the corner' : 'Low man recovers to corner')
  }
  if (exchange) add(r.backside, 'corner', r.weakCorner, 'closeout', cornerGuard, earlyExchange ? 'Early X-out begins during the tag' : 'Backside takes first corner pass')
  else if (answer.backside === 'stay' || passLift || !tagActive && !tagPlanned) add(r.backside, 'lift', r.weakLift, 'guard', liftGuard, passLift ? 'Close to the lift on the read' : answer.backside === 'stay' ? 'Stay with the lifting receiver through the tag' : 'Protect the lifting receiver')
  else {
    // This answer's authored help-the-helper rule: a shallow tag leaves the
    // low defender close enough to own the corner; a committed tag asks the
    // higher defender to split the pair. Coaches can choose stay or early X-out.
    const split = clamp((answer.tagDepth - 0.3) * 0.95, 0, 0.6) * (tagActive ? 1 : 0.4), target = { x: lerp(liftGuard.x, cornerGuard.x, split), z: lerp(liftGuard.z, cornerGuard.z, split) }
    add(r.backside, 'lift', r.weakLift, 'split', target, 'Split weakside receivers while low man tags')
    add(r.backside, 'corner', r.weakCorner, 'split', target, 'Help the helper; read the first weakside pass', 0.9)
  }
  // Content may replace explicit role obligations through the same observed
  // predicate algebra as the offense. Assignments remain coach-owned.
  for (const rule of [...problem.defenseRules ?? [], ...compileCoachRules(answer, problem, config)]) {
    if (rule.answer && Object.entries(rule.answer).some(([key, value]) => answer[key as keyof TeamAnswer] !== value)) continue
    if (rule.when && !evaluateCondition(rule.when, observed, problem, opponentAt(config, t) ?? DEFAULT_OPPONENT, { activations: observed.policyActivations ?? [] }).matches) continue
    const replaced = new Set(rule.assignments.map(a => r[a.defender]))
    for (let i = responsibilities.length - 1; i >= 0; i--) if (replaced.has(responsibilities[i].defenderId)) responsibilities.splice(i, 1)
    for (const assignment of rule.assignments) add(r[assignment.defender], assignment.threat, r[assignment.offense], assignment.kind, assignment.target === 'tag-depth' && assignment.defender === 'lowMan' && assignment.offense === 'screener' ? { ...tagTarget } : towardRim(player(ps, r[assignment.offense]), assignment.gap), rule.label, assignment.priority, undefined, rule.id)
  }
  // The active ball threat owns closeout priority; preserve explicit exchanges.
  if (!ballAtHandler && activeCarrier.team === 'offense') {
    const active = responsibilities.find(q => q.offensivePlayerId === activeCarrier.id && q.kind !== 'recover' && q.kind !== 'tag')
    if (active) { active.target = towardRim(activeCarrier, 0.7); active.priority = 2 }
  }
  return responsibilities
}
