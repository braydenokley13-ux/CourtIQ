import { describe, expect, it } from 'vitest'
import { sampleArrivalField } from './arrivalField'
import type { ModelAssumptions, PlayerState, WorldFrame } from '../domain/types'

const assumptions: ModelAssumptions = {
  dt: 0.025,
  duration: 5.8,
  maxSpeed: 4.7,
  acceleration: 6.2,
  reactionDelay: 0.3,
  passSpeed: 11.5,
  ballRadius: 0.12,
  bodyRadius: 0.28,
  contestRadius: 1.25,
  turnRate: 5,
  gatherTime: 0.26,
  readInterval: 0.15,
  gravity: 9.81,
  releaseHeight: 1.85,
}
const helper: PlayerState = {
  id: 'rotation-helper',
  team: 'defense',
  role: 'baseline-rotation',
  number: 3,
  height: 1.9,
  x: 0,
  z: 1,
  vx: 0,
  vz: 0,
  yaw: 0,
  speed: 1,
  acceleration: 1,
  lateral: 1,
  contest: 1,
  pose: { stance: 'ready', phase: 0, hands: 0, jump: 0 },
}
const frame = (player = helper): WorldFrame => ({
  tick: 0,
  t: 0,
  players: [player],
  ball: { phase: 'handle', owner: null, receiver: null, flight: null, x: 0, y: 1, z: 1 },
  responsibilities: [],
  options: [],
  policyEvaluations: [],
  parameterValues: {},
  stage: 'rotation',
})

describe('arrival field shares the experiment physical assumptions', () => {
  it('keeps attacked-baseline samples near the helper and far-baseline samples distant', () => {
    const field = sampleArrivalField(frame(), assumptions, 3, 3)
    expect(field.seconds[1]).toBeGreaterThan(3)
    expect(field.seconds[7]).toBe(0)
  })

  it('changes the field when a slow helper or delayed reaction replaces a quick helper', () => {
    const fast = sampleArrivalField(frame({ ...helper, speed: 1.25 }), assumptions, 3, 3)
    const slow = sampleArrivalField(frame({ ...helper, speed: 0.6 }), assumptions, 3, 3)
    const delayed = sampleArrivalField(frame({ ...helper, speed: 1.25 }), { ...assumptions, reactionDelay: 0.7 }, 3, 3)
    expect(slow.seconds[1]).toBeGreaterThan(fast.seconds[1] + 1)
    expect(delayed.seconds[1] - fast.seconds[1]).toBeCloseTo(0.4, 10)
    expect(delayed.seconds[7]).toBe(0)
  })

  it('uses actual velocity and facing rather than a second neutral-athlete estimate', () => {
    const toward = sampleArrivalField(frame({ ...helper, vz: 3 }), assumptions, 3, 3)
    const away = sampleArrivalField(frame({ ...helper, vz: -3 }), assumptions, 3, 3)
    const lateral = sampleArrivalField(frame({ ...helper, lateral: 0.4, yaw: Math.PI / 2 }), assumptions, 3, 3)
    expect(toward.seconds[1]).toBeLessThan(away.seconds[1])
    expect(lateral.seconds[1]).toBeGreaterThan(away.seconds[1])
  })

  it('is deterministic, does not mutate the frame and bounds renderer work', () => {
    const input = frame(),
      before = JSON.stringify(input)
    expect(sampleArrivalField(input, assumptions)).toEqual(sampleArrivalField(input, assumptions))
    expect(JSON.stringify(input)).toBe(before)
    expect(() => sampleArrivalField(input, assumptions, 100, 100)).toThrow(/budget/)
    expect(() => sampleArrivalField(input, assumptions, 1, 31)).toThrow(/budget/)
  })
})
