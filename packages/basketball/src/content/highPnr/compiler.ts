import type { ExecutionCommand, ExecutionInput, ParameterValues } from '../../domain/program'
import { CONFIG_SCHEMA_VERSION, ENGINE_VERSION, contentHash, parseExecutionInput } from '../../domain/execution'
import { installedProgram } from '../manifest'
import { parseLabConfig } from './config'
import { DEFAULT_OPPONENT } from './offensivePolicy'
import type { LabConfig, TeamAnswer } from './types'
import { role, param, all, cmp } from '../expressions'
function answerValues(answer: Partial<TeamAnswer>): ParameterValues {
  const values: ParameterValues = {}
  for (const [key, value] of Object.entries(answer)) {
    if (key !== 'coachRules' && value !== undefined && ['number', 'boolean', 'string'].includes(typeof value))
      values[`defense.${key}`] = value as number | string | boolean
  }
  if (answer.coachRules !== undefined) {
    values['coach.roller.enabled'] = false
    values['coach.lift.enabled'] = false
    for (const rule of answer.coachRules) {
      if (rule.kind === 'roller-depth') {
        values['coach.roller.enabled'] = true
        values['coach.roller.depth'] = rule.depth
        values['coach.roller.response'] = rule.response
      } else {
        values['coach.lift.enabled'] = true
        values['coach.lift.rise'] = rule.rise
        values['coach.lift.response'] = rule.response
      }
    }
  }
  return values
}
export function compileExperiment(recipe: LabConfig): ExecutionInput {
  const config = parseLabConfig(recipe),
    program = installedProgram(config.problemId)
  if (program.id !== 'high-pnr-weakside-lift')
    throw new Error('This recipe belongs to the high P&R authoring family. Use the selected content’s execution input.')
  const parameters: ParameterValues = Object.fromEntries(program.parameters.map((p) => [p.id, p.default]))
  Object.assign(parameters, answerValues(config.answer), {
    'legacy.screenAngle': config.screenAngle ?? 0,
    'offense.intent': config.counter,
    'offense.adaptive': !!config.opponent,
    'model.reactionDelay': config.assumptions.reactionDelay,
    'model.contestRadius': config.assumptions.contestRadius,
    'model.releaseHeight': config.assumptions.releaseHeight,
    'initial.liftZ':
      config.startingPositions?.[program.roles.weakLift]?.z ??
      program.players.find((p) => p.id === program.roles.weakLift)!.start.z,
  })
  for (const [k, v] of Object.entries(config.opponent ?? DEFAULT_OPPONENT)) parameters[`offense.${k}`] = v
  const commands: ExecutionCommand[] = [...config.interventions]
    .sort((a, b) => a.at - b.at)
    .map((c) =>
      c.kind === 'answer'
        ? { id: c.id, at: c.at, kind: 'parameters', values: answerValues(c.patch) }
        : c.kind === 'opponent'
          ? {
              id: c.id,
              at: c.at,
              kind: 'parameters',
              values: {
                'offense.adaptive': true,
                ...Object.fromEntries(Object.entries(c.patch).map(([k, v]) => [`offense.${k}`, v])),
              },
            }
          : {
              id: c.id,
              at: c.at,
              kind: 'move',
              playerId: c.playerId,
              target: c.target,
              ...(c.until === undefined ? {} : { until: c.until }),
              ...(c.untilTrigger === undefined
                ? {}
                : {
                    release:
                      c.untilTrigger === 'ball-leaves'
                        ? all({ ballPhase: ['pass', 'shot'] }, cmp({ metric: 'time' }, 'gte', c.at))
                        : all(
                            cmp({ metric: 'time' }, 'gte', c.at),
                            { distance: [role('big'), role('screener')], below: param('model.contestRadius') },
                            { obligation: role('big'), kind: 'recover' },
                          ),
                  }),
            },
    )
  return parseExecutionInput({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    content: { id: program.id, version: program.version, hash: contentHash(program) },
    program,
    seed: config.seed,
    assumptions: config.assumptions,
    parameters,
    commands,
    ...(config.startingPositions ? { startingPositions: config.startingPositions } : {}),
    ...(config.personnel ? { personnel: config.personnel } : {}),
  })
}
export const compileLabConfig = compileExperiment
