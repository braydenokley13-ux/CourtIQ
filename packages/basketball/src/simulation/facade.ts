import type { ExecutionInput, ExecutionCommand } from '../domain/program'
import type { ExecutionTrace, WorldFrame } from '../domain/types'
import type { LabConfig, LabWorldFrame, SimulationResult, TeamAnswer } from '../content/highPnr/types'
import { parseExecutionInput } from '../domain/execution'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from '../content/highPnr/scenario'
import { compileExperiment } from '../content/highPnr/compiler'
import { replayExecution } from './runtime'
import { flightPosition } from './physicalExecution'
export { compileExperiment, compileExperiment as compileLabConfig, replayExecution, createDefaultConfig }
export { parametersAt } from './runtime'
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export function answerAt(config: LabConfig, time: number): TeamAnswer {
  const answer = clone(config.answer)
  for (const cue of config.interventions)
    if (cue.at <= time + 1e-9 && cue.kind === 'answer') Object.assign(answer, clone(cue.patch))
  return answer
}
/** Family adapter for the product's P&R controls. The runner receives only canonical IR. */
export function simulate(config: LabConfig = createDefaultConfig()): SimulationResult {
  const recipe = clone(config),
    trace = replayExecution(compileExperiment(recipe))
  return {
    ...trace,
    config: recipe,
    frames: trace.frames.map((frame) => ({ ...frame, answer: answerAt(recipe, frame.t) })),
  }
}
/** Replay branching always starts from the immutable portable input, including observation history. */
export function forkExecution(input: ExecutionInput, tick: number, commands: ExecutionCommand[]): ExecutionInput {
  if (!Number.isInteger(tick) || tick < 0 || tick > Math.round(input.assumptions.duration / input.assumptions.dt))
    throw new Error('Invalid fork tick.')
  const at = Number((tick * input.assumptions.dt).toFixed(6))
  if (commands.some((c) => c.at < at - 1e-9)) throw new Error('A fork cannot rewrite its observed prefix.')
  return parseExecutionInput({
    ...clone(input),
    commands: [...clone(input.commands), ...clone(commands)].sort((a, b) => a.at - b.at),
  })
}
export function simulateProblem(
  program: ExecutionInput['program'],
  input: Omit<ExecutionInput, 'program'>,
): ExecutionTrace {
  return replayExecution({ ...input, program })
}
export function frameAt(result: SimulationResult, time: number): LabWorldFrame
export function frameAt(result: ExecutionTrace, time: number): WorldFrame
export function frameAt(result: ExecutionTrace, time: number): WorldFrame {
  const frames = result.frames
  if (!frames.length) throw new Error('An empty trace has no presentation frame.')
  let low = 0,
    high = frames.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (frames[middle].t <= time + 1e-9) low = middle + 1
    else high = middle
  }
  const index = Math.max(0, low - 1),
    a = frames[index],
    b = frames[Math.min(index + 1, frames.length - 1)],
    u = a.t === b.t ? 0 : clamp((time - a.t) / (b.t - a.t), 0, 1),
    lerp = (a: number, b: number) => a + (b - a) * u,
    angle = (a: number, b: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u,
    stop = a.ball.flight
      ? result.diagnostics.flightStops?.find((s) => s.flightStart === a.ball.flight!.start && time >= s.at - 1e-9)
      : undefined
  return {
    ...clone(a),
    ...(stop ? { stage: 'finished', options: a.options.map((o) => ({ ...o, available: false })) } : {}),
    t: clamp(time, 0, frames.at(-1)!.t),
    players: a.players.map((p, i) => ({
      ...p,
      x: lerp(p.x, b.players[i].x),
      z: lerp(p.z, b.players[i].z),
      vx: lerp(p.vx, b.players[i].vx),
      vz: lerp(p.vz, b.players[i].vz),
      yaw: angle(p.yaw, b.players[i].yaw),
      pose: {
        ...p.pose,
        phase: lerp(p.pose.phase, b.players[i].pose.phase),
        jump: lerp(p.pose.jump, b.players[i].pose.jump),
      },
    })),
    ball: stop
      ? { ...stop.ball, phase: 'dead', owner: null, receiver: null, flight: null }
      : a.ball.flight
        ? { ...clone(a.ball), ...flightPosition(a.ball.flight, time, result.input.assumptions.gravity) }
        : a.ball.phase === b.ball.phase && a.ball.owner === b.ball.owner
          ? { ...clone(a.ball), x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z) }
          : clone(a.ball),
  }
}
export const MODEL_PROBLEM = HIGH_PNR_PROBLEM
