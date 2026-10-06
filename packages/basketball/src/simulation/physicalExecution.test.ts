import { describe, expect, it } from 'vitest'
import { analyzeFlights } from '../queries/analytics'
import { ballBodyClearance } from './analyticalGeometry'
import { canReachBall, catchSupport, firstFlightContact } from './physicalExecution'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from '../content/highPnr/scenario'
import { frameAt, simulate, compileExperiment, replayExecution } from './facade'
import { contentHash } from '../domain/execution'
import type { BallFlight, PlayerState, ExecutionTrace, WorldFrame } from '../domain/types'

const assumptions = createDefaultConfig().assumptions
const player = (id: PlayerState['id'] = 'D3', height = 1.94): PlayerState => ({
  id,
  team: id.startsWith('D') ? 'defense' : 'offense',
  role: 'low-man',
  number: 3,
  x: 0,
  z: 3,
  height,
  vx: 0,
  vz: 0,
  yaw: 0,
  pose: { stance: 'defend', hands: 0.8, phase: 0, jump: 0 },
})

describe('bounded physical execution', () => {
  it('turns once per clock tick and allows ball-facing defensive slides', () => {
    const config = createDefaultConfig()
    const run = simulate({
      ...config,
      interventions: [{ id: 'slide-away', at: 0, kind: 'move', playerId: 'D3', target: { x: -6.5, z: 6 }, until: 2 }],
    })
    for (let i = 1; i < run.frames.length; i++)
      for (let j = 0; j < run.frames[i].players.length; j++) {
        const delta = run.frames[i].players[j].yaw - run.frames[i - 1].players[j].yaw
        expect(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)))).toBeLessThanOrEqual(
          config.assumptions.turnRate * config.assumptions.dt + 1e-9,
        )
      }
    const sliding = run.frames.some((world) => {
      const defender = world.players.find((p) => p.id === 'D3')!
      const speed = Math.hypot(defender.vx, defender.vz)
      return (
        speed > 0.5 &&
        Math.abs((defender.vx * Math.sin(defender.yaw) + defender.vz * Math.cos(defender.yaw)) / speed) < 0.5
      )
    })
    expect(sliding).toBe(true)
  })

  it('halts the executed possession at body contact without inventing a catch or turnover', () => {
    const config = createDefaultConfig()
    const input = compileExperiment({
      ...config,
      startingPositions: { D4: { x: -3.4, z: 6.7 } },
      interventions: [{ id: 'body-in-lane', kind: 'move', at: 0, playerId: 'D4', target: { x: -3.4, z: 6.7 } }],
    })
    input.program.reads.find((n) => n.id === 'handler-read')!.options = ['lift']
    input.program.reads.find((n) => n.id === 'handler-read')!.continuations = { lift: 'lift-read' }
    input.content.hash = contentHash(input.program)
    const run = replayExecution(input)
    const stop = run.diagnostics.flightStops?.[0]
    expect(stop?.playerId).toBe('D4')
    expect(stop?.clearance).toBeLessThan(0)
    expect(run.decisions.map((decision) => decision.selected)).toEqual(['lift'])
    expect(run.events.some((event) => ['catch', 'shot', 'missed-catch'].includes(event.type))).toBe(false)
    expect(
      run.frames
        .filter((world) => world.t >= stop!.at)
        .every((world) => world.ball.phase === 'dead' && world.ball.owner === null),
    ).toBe(true)
    const sampled = frameAt(run, stop!.at + 0.0001)
    expect(sampled.ball.phase).toBe('dead')
    expect(sampled.ball.flight).toBeNull()
    expect(sampled.ball.x).toBe(stop!.ball.x)
    expect(sampled.options.every((option) => !option.available)).toBe(true)
    const body = frameAt(run, stop!.at).players.find((p) => p.id === stop!.playerId)!
    expect(ballBodyClearance(stop!.ball, body, config.assumptions).clearance).toBeCloseTo(stop!.clearance, 10)
    const evidence = analyzeFlights(run).find((flight) => flight.start === stop!.flightStart)!
    expect(evidence.stoppedAt).toBe(stop!.at)
    expect(evidence.witness?.t).toBeLessThanOrEqual(stop!.at)
    expect(evidence.conditionalAfterContact).toBe(true)
    expect(run.diagnostics.warnings.some((warning) => warning.includes('unresolved'))).toBe(true)
  })

  it('probes a collision between motion ticks and clears an overhead pass', () => {
    const body = player()
    const flight: BallFlight = {
      from: 'O1',
      to: 'O3',
      start: 0,
      end: 0.5,
      a: { x: -4, z: 3, y: 1.3 },
      b: { x: 4, z: 3, y: 1.3 },
      kind: 'chest',
    }
    const stop = firstFlightContact(flight, [body], [body], 0.2, 0.25, assumptions)
    expect(stop).toBeTruthy()
    expect(stop!.at).toBeGreaterThan(0.2)
    expect(stop!.at).toBeLessThan(0.25)
    const overhead = { ...flight, a: { ...flight.a, y: 3.5 }, b: { ...flight.b, y: 3.5 }, kind: 'lob' as const }
    expect(firstFlightContact(overhead, [body], [body], 0.2, 0.25, assumptions)).toBeNull()
    expect(canReachBall({ x: 0, z: 3, y: 5 }, body, assumptions)).toBe(false)
  })

  it('uses height, hands and facing for catch support rather than a contradictory fixed radius', () => {
    const receiver = { ...player('O3', 1.9), pose: { ...player().pose, stance: 'catch' as const } }
    expect(catchSupport(receiver, { x: 0, z: 3.75, y: 1.55 }, assumptions).reachable).toBe(true)
    expect(catchSupport(receiver, { x: 0, z: 2.25, y: 1.55 }, assumptions).reachable).toBe(false)
    expect(catchSupport({ ...receiver, yaw: Math.PI }, { x: 0, z: 2.25, y: 1.55 }, assumptions).reachable).toBe(true)
    const high = { x: 0, z: 3, y: 2.2 }
    expect(catchSupport(receiver, high, assumptions).reachable).toBe(false)
    expect(
      catchSupport({ ...receiver, height: 2.1, pose: { ...receiver.pose, hands: 1 } }, high, assumptions).reachable,
    ).toBe(true)
    expect(catchSupport({ ...receiver, pose: { ...receiver.pose, jump: 0.25 } }, high, assumptions).reachable).toBe(
      true,
    )
  })

  it('does not share mutable physical snapshot fields after hot-clock serialization removal', () => {
    const run = simulate(createDefaultConfig()),
      next = structuredClone(run.frames[1])
    run.frames[0].players[0].pose.phase = 999
    run.frames[0].responsibilities[0].target.x = 999
    run.frames[0].options[0].target.x = 999
    expect(run.frames[1]).toEqual(next)
    const flights = run.frames.filter((world) => world.ball.flight)
    const laterEndpoint = { ...flights[1].ball.flight!.b }
    flights[0].ball.flight!.b.x = 999
    expect(flights[1].ball.flight!.b).toEqual(laterEndpoint)
  })

  it('audits the full shot arc, including body contact beyond the old 200 ms cut-off', () => {
    const flight: BallFlight = {
      from: 'O1',
      to: null,
      start: 0,
      end: 0.6,
      a: { x: -3, y: 1.2, z: 3 },
      b: { x: 3, y: 1.2, z: 3 },
      kind: 'shot',
    }
    const body = { ...player(), x: 0.8 }
    const config = createDefaultConfig()
    const frames: WorldFrame[] = Array.from({ length: 25 }, (_, i) => ({
      t: i * 0.025,
      players: [body],
      ball: { x: -3, y: 1.2, z: 3, phase: 'shot', owner: 'O1', receiver: null, flight },
      responsibilities: [],
      options: [],
      answer: config.answer,
      stage: 'release',
    }))
    const run: ExecutionTrace = {
      modelVersion: 'fixture',
      problemVersion: 'fixture',
      input: compileExperiment(config),
      frames,
      events: [],
      decisions: [],
      diagnostics: { contactCount: 0, maxCatchError: 0, boundaryBreach: false, warnings: [] },
    }
    const evidence = analyzeFlights(run)[0]
    expect(evidence.witness?.t).toBeGreaterThan(0.2)
    expect(evidence.minClearance).toBeLessThan(0)
    expect(evidence.conditionalAfterContact).toBe(true)
  })
})
