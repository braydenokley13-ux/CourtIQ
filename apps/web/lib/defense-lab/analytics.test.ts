import { describe, expect, it } from 'vitest'
import { analyze, analyzeFlights, compare, estimateArrival, responsibilityConflict, travelTime } from './analytics'
import { ballBodyClearance, segmentDistance } from './analyticalGeometry'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import type { BallFlight, PlayerState, Responsibility, SimulationResult, WorldFrame } from './types'

function players(): PlayerState[] {
  return HIGH_PNR_PROBLEM.players.map(player => ({ ...player, ...player.start, vx: 0, vz: 0, yaw: 0, pose: { stance: player.team === 'defense' ? 'defend' : 'ready', hands: 0.5, phase: 0, jump: 0 } }))
}
function frame(t: number): WorldFrame {
  return { t, players: players(), ball: { x: 1, y: 1.3, z: 7, owner: 'O1', receiver: null, flight: null, phase: 'handle' }, responsibilities: [], options: [], answer: { ...createDefaultConfig().answer }, stage: 'read' }
}
function result(frames: WorldFrame[]): SimulationResult {
  const config = createDefaultConfig()
  config.assumptions.dt = frames[1]?.t - frames[0]?.t || 0.025
  config.assumptions.duration = frames.at(-1)?.t ?? 0
  return { config, modelVersion: 'test-geometry', problemVersion: 'test', frames, events: [], decisions: [], diagnostics: { contactCount: 0, maxCatchError: 0, boundaryBreach: false, warnings: [] } }
}
function commitment(threatId: 'roll' | 'corner', x: number, dueAt: number): Responsibility {
  return { id: threatId, defenderId: 'D3', threatId, offensivePlayerId: threatId === 'roll' ? 'O5' : 'O3', kind: 'tag', target: { x, z: 3 }, priority: 1, trigger: 'modeled read', startedAt: 0, influenceRadius: 0.4, availableAt: 0, dueAt }
}

describe('defender arrival assumptions', () => {
  it('accounts for acceleration, the speed cap and motion away from a target', () => {
    expect(travelTime(2, 0, 4, 10)).toBeCloseTo(1)
    expect(travelTime(12, 0, 4, 4)).toBeCloseTo(3.5)
    const assumptions = { acceleration: 6, maxSpeed: 4.7, reactionDelay: 0.2 }
    const toward = estimateArrival({ x: 0, z: 0, vx: 2, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)
    const away = estimateArrival({ x: 0, z: 0, vx: -2, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)
    expect(away).toBeGreaterThan(toward)
    expect(estimateArrival({ x: 2, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)).toBeLessThan(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1))
    expect(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 2)).toBeLessThan(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1))
    expect(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 0.5, z: 0 }, assumptions, 1)).toBe(0)
  })
})

describe('coached responsibility conflicts', () => {
  it('proves incompatible concurrent commitments using both visit orders', () => {
    const world = frame(0)
    const lowMan = world.players.find(player => player.id === 'D3')!
    lowMan.x = 0; lowMan.z = 3
    const assumptions = createDefaultConfig().assumptions
    const conflict = responsibilityConflict(world, commitment('roll', -3, 0.3), commitment('corner', 3, 0.3), assumptions)
    expect(conflict?.defenderId).toBe('D3')
    expect(conflict?.minimumTransit).toBeGreaterThan(1)
    expect(responsibilityConflict(world, commitment('roll', -3, 3), commitment('corner', 3, 6), assumptions)).toBeNull()
  })
  it('does not call a long travel distance a structural conflict without explicit deadlines', () => {
    const a = commitment('roll', -6, 1)
    delete a.dueAt
    expect(responsibilityConflict(frame(0), a, commitment('corner', 6, 1), createDefaultConfig().assumptions)).toBeNull()
  })
})

describe('option windows and tradeoffs', () => {
  it('requires sustained observed responsibility coverage before declaring recovery', () => {
    const frames = Array.from({ length: 21 }, (_, index) => {
      const world = frame(index * 0.1)
      const defender = world.players.find(player => player.id === 'D3')!
      defender.x = index < 7 ? -4 : 0; defender.z = 3
      world.responsibilities = [{ ...commitment('roll', 0, 4), influenceRadius: 0.6 }]
      world.ball.phase = 'dead'
      return world
    })
    const run = result(frames)
    run.events = [{ id: 'tag', t: 0.2, type: 'tag', label: 'Low man tags', playerId: 'D3' }]
    expect(analyze(run).recovery.seconds).toBeCloseTo(0.5)
    const unrecovered = result(frames.map(world => ({ ...world, players: world.players.map(player => player.id === 'D3' ? { ...player, x: -4 } : player) })))
    unrecovered.events = run.events
    expect(analyze(unrecovered).recovery.seconds).toBeNull()
  })

  it('measures the longest contiguous window rather than joining separate openings', () => {
    const frames = Array.from({ length: 21 }, (_, index) => {
      const world = frame(index * 0.1)
      world.options = [{ id: 'lift', kind: 'lift', playerId: 'O4', target: { x: -5, z: 7 }, available: index < 5 || index >= 10 && index < 13, influenceDistance: 3, passClearance: 1, responsibleDefenderId: 'D4' }]
      return world
    })
    const analysis = analyze(result(frames))
    expect(analysis.windows[0].duration).toBeCloseTo(0.5)
    expect(analysis.windows[0].totalDuration).toBeCloseTo(0.8)
    expect(analysis.windows[0].intervals).toEqual([{ start: 0, end: 0.5 }, { start: 1, end: 1.3 }])
  })
  it('requires both graph feasibility and defensive geometric space', () => {
    const frames = Array.from({ length: 21 }, (_, index) => {
      const world = frame(index * 0.1)
      world.options = [
        { id: 'lift', kind: 'lift', playerId: 'O4', target: { x: -5, z: 7 }, available: false, influenceDistance: 9, passClearance: 9 },
        { id: 'corner', kind: 'corner', playerId: 'O3', target: { x: -6, z: 1 }, available: true, influenceDistance: 9, passClearance: -0.1 },
      ]
      return world
    })
    expect(analyze(result(frames)).windows.every(window => window.duration === 0)).toBe(true)
  })
  it('reports conceded and closed windows independently', () => {
    const make = (liftEnd: number, rollEnd: number) => result(Array.from({ length: 21 }, (_, index) => {
      const world = frame(index * 0.1)
      world.options = [
        { id: 'lift', kind: 'lift', playerId: 'O4', target: { x: -5, z: 7 }, available: world.t < liftEnd, influenceDistance: 3, passClearance: 1 },
        { id: 'roll', kind: 'roll', playerId: 'O5', target: { x: 0, z: 2 }, available: world.t < rollEnd, influenceDistance: 3, passClearance: 1 },
      ]
      return world
    }))
    const change = compare(make(0.8, 0.2), make(0.2, 0.8))
    expect(change.tradeoffs.find(tradeoff => tradeoff.id === 'lift')?.direction).toBe('closes')
    expect(change.tradeoffs.find(tradeoff => tradeoff.id === 'roll')?.direction).toBe('opens')
    expect(change.explanation).toContain('opens')
  })
})

describe('launched ball / analytical body evidence', () => {
  it('clamps segment probes and detects a body interaction at true ball height', () => {
    expect(segmentDistance({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).distance).toBe(1)
    const defender = players().find(player => player.id === 'D3')!
    defender.x = 0; defender.z = 3
    const assumptions = createDefaultConfig().assumptions
    expect(ballBodyClearance({ x: 0, y: 1.2, z: 3 }, defender, assumptions).clearance).toBeLessThan(0)
    expect(ballBodyClearance({ x: 0, y: 3, z: 3 }, defender, assumptions).clearance).toBeGreaterThan(0.5)
  })
  it('probes between motion frames and records the limiting defender instead of completion odds', () => {
    const flight: BallFlight = { from: 'O1', to: 'O3', start: 0.1, end: 0.7, a: { x: 0, y: 1.2, z: 0 }, b: { x: 0, y: 1.2, z: 6 }, kind: 'chest' }
    const frames = Array.from({ length: 41 }, (_, index) => {
      const world = frame(index * 0.025)
      world.players.forEach(player => { if (player.team === 'defense') { player.x = 6; player.z = 6 } })
      const defender = world.players.find(player => player.id === 'D3')!
      defender.x = 0; defender.z = 3
      if (world.t >= flight.start && world.t <= flight.end) world.ball = { ...world.ball, phase: 'pass', flight }
      return world
    })
    const evidence = analyzeFlights(result(frames))[0]
    expect(evidence.sampleCount).toBeGreaterThan(100)
    expect(evidence.minClearance).toBeLessThan(0)
    expect(evidence.witness?.defenderId).toBe('D3')
    expect(evidence.conditionalAfterContact).toBe(true)
    expect(analyze(result(frames)).classification).toBe('thin')
  })
})
