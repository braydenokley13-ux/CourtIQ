/** Family authoring queries execute the compiled plan; replay/UI targets come from PolicyEvaluation. */
import { compileExperiment } from './compiler'
import { parametersAt } from '../../simulation/runtime'
import { defensiveObligations, observeActions } from '../../simulation/interpreter'
import type { HighPnrRecipeDefinition, LabConfig, TeamAnswer } from './types'
import type { Responsibility, WorldFrame } from '../../domain/types'
import type { PolicyMemory } from '../../domain/program'
export { HIGH_PNR_PROGRAM } from './program'
export const DROP_LINE_OFFSET = 1.9
export const dropLine = (depth: number) => depth + DROP_LINE_OFFSET
export interface DefensePolicyState {
  screenAt: number | null
  showReleased: boolean
  passed?: boolean
}
/** Explicit observation evaluator for authoring/tests. It is not a restore or presentation query. */
export function defenseResponsibilities(
  frame: WorldFrame,
  answer: TeamAnswer,
  problem: HighPnrRecipeDefinition,
  config: LabConfig,
  time: number,
  state?: DefensePolicyState,
  passed?: boolean,
): Responsibility[] {
  const input = compileExperiment({ ...config, answer }),
    program = input.program
  if (problem.id !== program.id) throw new Error('This evaluator belongs to the high P&R family.')
  for (const r of program.defenseRules) {
    const authored = problem.defenseRules?.find((a) => a.id === r.id)
    if (authored) r.label = authored.label
  }
  const memory: PolicyMemory = {
    flags: {
      passed: passed ?? state?.passed ?? ['pass', 'gather', 'shot'].includes(frame.ball.phase),
      showReleased: state?.showReleased ?? false,
    },
    encounters:
      state?.screenAt !== null && state?.screenAt !== undefined
        ? { 'high-screen': state.screenAt }
        : frame.screenEngagedAt === undefined
          ? {}
          : { 'high-screen': frame.screenEngagedAt },
    activations: frame.policyActivations ?? [],
  }
  const ctx = {
    program,
    observed: {
      tick: frame.tick,
      t: frame.t,
      players: frame.players,
      ball: frame.ball,
      responsibilities: frame.responsibilities,
      roleBindings: program.roles,
    },
    parameters: parametersAt(input, time),
    memory,
    owner:
      frame.ball.phase === 'pass'
        ? (frame.ball.receiver ?? program.initial.ballOwner)
        : (frame.ball.owner ?? program.initial.ballOwner),
    reader: frame.ball.owner ?? program.initial.ballOwner,
  }
  observeActions(ctx)
  return defensiveObligations(ctx, time, input.assumptions.gatherTime, input.assumptions.contestRadius).obligations
}
