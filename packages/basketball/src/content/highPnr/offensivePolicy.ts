import type { LabConfig, OpponentStrategy } from './types'

export const DEFAULT_OPPONENT: OpponentStrategy = {
  screenAngle: 0,
  liftDelay: 0,
  liftWidth: 0,
  reject: true,
  rescreen: false,
  shortRoll: true,
}
export const OPPONENT_BOUNDS = { screenAngle: [-0.65, 0.65], liftDelay: [-0.25, 0.6], liftWidth: [-0.7, 0.7] } as const
export function opponentAt(config: LabConfig, time: number): OpponentStrategy | undefined {
  let opponent = config.opponent ? { ...config.opponent } : undefined
  for (const cue of [...config.interventions].sort((a, b) => a.at - b.at))
    if (cue.kind === 'opponent' && cue.at <= time + 1e-9) opponent = { ...(opponent ?? DEFAULT_OPPONENT), ...cue.patch }
  return opponent
}
