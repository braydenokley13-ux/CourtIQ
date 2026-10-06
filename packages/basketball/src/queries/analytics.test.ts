import { describe, expect, it } from 'vitest'
import {
  analyze,
  analyzeFlights,
  compare,
  defenderArrival,
  estimateArrival,
  isThreatOpen,
  responsibilityConflict,
  travelTime,
} from './analytics'
import { ballBodyClearance, segmentDistance } from '../simulation/geometry'
import type {
  BallFlight,
  ExecutionTrace,
  ModelAssumptions,
  PlayerState,
  Responsibility,
  ThreatOption,
  WorldFrame,
} from '../domain/types'
import type { ContentProgram } from '../domain/program'

const baseAssumptions: ModelAssumptions = {
  dt: 0.025,
  duration: 2,
  maxSpeed: 4.7,
  acceleration: 6,
  reactionDelay: 0.2,
  passSpeed: 11,
  ballRadius: 0.12,
  bodyRadius: 0.28,
  contestRadius: 1,
  turnRate: 5,
  gatherTime: 0.25,
  readInterval: 0.15,
  gravity: 9.81,
  releaseHeight: 1.3,
}

function players(): PlayerState[] {
  const roster: Pick<PlayerState, 'id' | 'team' | 'role' | 'number' | 'height' | 'x' | 'z'>[] = [
    { id: 'initiator', team: 'offense', role: 'ball-carrier', number: 1, height: 1.86, x: 1, z: 7 },
    { id: 'receiver', team: 'offense', role: 'perimeter-option', number: 2, height: 1.86, x: -5, z: 7 },
    { id: 'finisher', team: 'offense', role: 'interior-option', number: 3, height: 2.03, x: 0, z: 2 },
    { id: 'rotator', team: 'defense', role: 'helper', number: 4, height: 1.86, x: 6, z: 11 },
    { id: 'second-defender', team: 'defense', role: 'second-helper', number: 5, height: 1.86, x: 5, z: 11 },
  ]
  return roster.map((player) => ({
    ...player,
    vx: 0,
    vz: 0,
    yaw: 0,
    pose: { stance: player.team === 'defense' ? 'defend' : 'ready', hands: 0.5, phase: 0, jump: 0 },
  }))
}

function frame(t: number): WorldFrame {
  return {
    t,
    tick: Math.round(t / baseAssumptions.dt),
    players: players(),
    ball: { x: 1, y: 1.3, z: 7, owner: 'initiator', receiver: null, flight: null, phase: 'dead' },
    responsibilities: [],
    options: [],
    stage: 'read',
    policyEvaluations: [],
    parameterValues: {},
  }
}

function program(): ContentProgram {
  const roster = players().map(({ id, team, role, number, height, x, z }) => ({
    id,
    team,
    role,
    number,
    height,
    start: { x, z },
  }))
  return {
    id: 'query-fixture',
    version: '1',
    title: 'Independent query fixture',
    description: 'Synthetic physical observations.',
    players: roster,
    roles: Object.fromEntries(roster.map((player) => [player.role, player.id])),
    initial: { ballOwner: 'initiator', readNode: null, matchups: [] },
    parameters: [],
    actions: [],
    reads: [],
    offenseRules: [],
    defenseRules: [],
    memoryRules: [],
    variations: [],
    editAt: 0,
    opportunities: [
      {
        id: 'spot-pass',
        label: 'Perimeter receiver',
        actor: { player: 'receiver' },
        kind: 'pass',
        target: { actor: { player: 'receiver' } },
        scoreBias: 0,
        laneWeight: 1,
      },
      {
        id: 'inside-pass',
        label: 'Interior finish',
        actor: { player: 'finisher' },
        kind: 'pass',
        target: { actor: { player: 'finisher' } },
        scoreBias: 0,
        laneWeight: 1,
      },
      {
        id: 'ball-keep',
        label: 'Carrier attack',
        actor: { current: 'owner' },
        kind: 'keep',
        target: { x: 0, z: 3 },
        scoreBias: 0,
        laneWeight: 1,
      },
    ],
    terminal: {
      maxPasses: 3,
      keepDuration: 0.8,
      finishRadius: 1.2,
      keepGap: 1.6,
      keepSpeed: 4,
      keepHorizon: 0.8,
      patientPassLead: 0.1,
      patientKeepLead: 0.35,
      shotBaseDuration: 0.7,
      shotDistanceDuration: 0.02,
      shotReleaseHeight: 2,
      shotHeightReference: 1.86,
      shotHeightScale: 0.7,
    },
  }
}

function result(frames: WorldFrame[]): ExecutionTrace {
  const authored = program()
  return {
    input: {
      schemaVersion: 1,
      engineVersion: 'test-geometry',
      content: { id: authored.id, version: authored.version, hash: 'query-fixture-v1' },
      program: authored,
      seed: 1,
      parameters: {},
      commands: [],
      assumptions: {
        ...baseAssumptions,
        dt: frames[1]?.t - frames[0]?.t || baseAssumptions.dt,
        duration: frames.at(-1)?.t ?? 0,
      },
    },
    modelVersion: 'test-geometry',
    problemVersion: 'test',
    frames,
    events: [],
    decisions: [],
    diagnostics: { contactCount: 0, maxCatchError: 0, boundaryBreach: false, warnings: [] },
  }
}

function commitment(threatId: string, x: number, dueAt: number): Responsibility {
  return {
    id: `task-${threatId}`,
    defenderId: 'rotator',
    threatId,
    offensivePlayerId: threatId === 'inside-pass' ? 'finisher' : 'receiver',
    kind: 'tag',
    target: { x, z: 3 },
    priority: 1,
    trigger: 'modeled read',
    startedAt: 0,
    influenceRadius: 0.4,
    availableAt: 0,
    dueAt,
  }
}

function passOption(id = 'spot-pass'): ThreatOption {
  return {
    id,
    kind: 'pass',
    playerId: 'receiver',
    target: { x: -5, z: 7 },
    available: true,
    influenceDistance: 9,
    passClearance: 1,
  }
}

describe('defender arrival assumptions', () => {
  it('accounts for acceleration, the speed cap and motion away from a target', () => {
    expect(travelTime(2, 0, 4, 10)).toBeCloseTo(1)
    expect(travelTime(12, 0, 4, 4)).toBeCloseTo(3.5)
    const assumptions = { acceleration: 6, maxSpeed: 4.7, reactionDelay: 0.2 }
    const toward = estimateArrival({ x: 0, z: 0, vx: 2, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)
    const away = estimateArrival({ x: 0, z: 0, vx: -2, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)
    expect(away).toBeGreaterThan(toward)
    expect(estimateArrival({ x: 2, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1)).toBeLessThan(
      estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1),
    )
    expect(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 2)).toBeLessThan(
      estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 4, z: 0 }, assumptions, 1),
    )
    expect(estimateArrival({ x: 0, z: 0, vx: 0, vz: 0 }, { x: 0.5, z: 0 }, assumptions, 1)).toBe(0)
  })

  it('retains individual acceleration, directional speed and reach', () => {
    const defender = { ...players().find((player) => player.id === 'rotator')!, x: 0, z: 7, lateral: 0.5 }
    const target = { x: 4, z: 7 }
    const forward = estimateArrival({ ...defender, yaw: Math.PI / 2 }, target, baseAssumptions, 0, 0)
    const lateral = estimateArrival({ ...defender, yaw: 0 }, target, baseAssumptions, 0, 0)
    expect(lateral).toBeGreaterThan(forward)
    expect(estimateArrival({ ...defender, acceleration: 0.5 }, target, baseAssumptions, 0, 0)).toBeGreaterThan(lateral)
    expect(defenderArrival({ ...defender, contest: 1.5 }, target, baseAssumptions)).toBeLessThan(
      defenderArrival({ ...defender, contest: 0.75 }, target, baseAssumptions),
    )
  })

  it('handles exhausted distance and unsupported movement parameters', () => {
    expect(travelTime(0, -5, 0, 0)).toBe(0)
    expect(travelTime(1, 0, 0, 4)).toBe(Infinity)
    expect(travelTime(1, 0, 4, 0)).toBe(Infinity)
  })
})

describe('analytical body envelopes', () => {
  it('clamps segment probes and detects a body interaction at true ball height', () => {
    expect(segmentDistance({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).distance).toBe(1)
    const defender = { ...players().find((player) => player.id === 'rotator')!, x: 0, z: 3 }
    expect(ballBodyClearance({ x: 0, y: 1.2, z: 3 }, defender, baseAssumptions).clearance).toBeLessThan(0)
    expect(ballBodyClearance({ x: 0, y: 3, z: 3 }, defender, baseAssumptions).clearance).toBeGreaterThan(0.5)
  })
})

describe('coached responsibility conflicts', () => {
  it('proves incompatible concurrent commitments using both visit orders and generic subjects', () => {
    const world = frame(0)
    const helper = world.players.find((player) => player.id === 'rotator')!
    helper.x = 0
    helper.z = 3
    const conflict = responsibilityConflict(
      world,
      commitment('inside-pass', -3, 0.3),
      commitment('spot-pass', 3, 0.3),
      baseAssumptions,
    )
    expect(conflict?.defenderId).toBe('rotator')
    expect(conflict?.minimumTransit).toBeGreaterThan(1)
    expect(conflict?.explanation).toContain('inside-pass and spot-pass')
    expect(
      responsibilityConflict(world, commitment('inside-pass', -3, 3), commitment('spot-pass', 3, 6), baseAssumptions),
    ).toBeNull()
  })

  it('requires explicit deadlines, including for area obligations with no offensive actor', () => {
    const area = commitment('protect-area', -6, 1)
    delete area.offensivePlayerId
    delete area.dueAt
    expect(responsibilityConflict(frame(0), area, commitment('spot-pass', 6, 1), baseAssumptions)).toBeNull()
    area.dueAt = 0.1
    expect(responsibilityConflict(frame(0), area, commitment('spot-pass', 6, 0.1), baseAssumptions)?.threatIds).toEqual(
      ['protect-area', 'spot-pass'],
    )
  })

  it('does not declare a feasible fast defender path impossible using baseline capability', () => {
    const world = frame(0)
    const helper = world.players.find((player) => player.id === 'rotator')!
    Object.assign(helper, { x: 0, z: 3, vx: 6.58, yaw: Math.PI / 2, speed: 1.4, acceleration: 1.4 })
    const first = { ...commitment('inside-pass', 0, 0.1), influenceRadius: 0 }
    const second = { ...commitment('spot-pass', 4, 0.8), influenceRadius: 0 }
    // This actual forward path reaches the first target at t=0 and the second
    // at t=4/6.58. Both deadlines are met by the player's supported capability.
    expect(4 / (baseAssumptions.maxSpeed * helper.speed!)).toBeLessThan(second.dueAt!)
    expect(responsibilityConflict(world, first, second, baseAssumptions)).toBeNull()
  })

  it('uses individual acceleration in the optimistic initial travel bound', () => {
    const world = frame(0)
    const helper = world.players.find((player) => player.id === 'rotator')!
    Object.assign(helper, { x: 0, z: 3, yaw: Math.PI / 2, speed: 1.4, acceleration: 1.4 })
    const first = { ...commitment('inside-pass', 2, 0.71), influenceRadius: 0 }
    const second = { ...commitment('spot-pass', 4, 1.4), influenceRadius: 0 }
    expect(travelTime(2, 0, baseAssumptions.acceleration * helper.acceleration!, 6.58)).toBeLessThan(first.dueAt!)
    expect(responsibilityConflict(world, first, second, baseAssumptions)).toBeNull()
  })

  it('uses authored opportunity labels in full analysis without scenario fallback', () => {
    const world = frame(0)
    world.responsibilities = [commitment('inside-pass', -3, 0.1), commitment('spot-pass', 3, 0.1)]
    const analysis = analyze(result([world]))
    expect(analysis.conflicts[0].explanation).toContain('interior finish and perimeter receiver')
  })

  it('retains separate conflicts for namespaced IDs that share delimiter text', () => {
    const first = frame(0)
    first.responsibilities = [commitment('a:b', -3, 0.1), commitment('c', 3, 0.1)]
    const second = frame(0.025)
    second.responsibilities = [commitment('a', -3, 0.1), commitment('b:c', 3, 0.1)]
    expect(analyze(result([first, second])).conflicts).toHaveLength(2)
  })
})

describe('option windows and tradeoffs', () => {
  it('requires sustained observed responsibility coverage before declaring recovery', () => {
    const frames = Array.from({ length: 41 }, (_, index) => {
      const world = frame(index * 0.05)
      const defender = world.players.find((player) => player.id === 'rotator')!
      defender.x = index < 14 ? -4 : 0
      defender.z = 3
      world.responsibilities = [{ ...commitment('inside-pass', 0, 4), influenceRadius: 0.6 }]
      return world
    })
    const run = result(frames)
    run.events = [{ id: 'tag', t: 0.2, type: 'tag', label: 'Helper tags', playerId: 'rotator' }]
    expect(analyze(run).recovery.seconds).toBeCloseTo(0.5)
    const unrecovered = result(
      frames.map((world) => ({
        ...world,
        players: world.players.map((player) => (player.id === 'rotator' ? { ...player, x: -4 } : player)),
      })),
    )
    unrecovered.events = run.events
    expect(analyze(unrecovered).recovery.seconds).toBeNull()
  })

  it('measures the longest contiguous opening rather than joining separate intervals', () => {
    const frames = Array.from({ length: 41 }, (_, index) => {
      const world = frame(index * 0.05)
      world.options = [{ ...passOption(), available: index < 10 || (index >= 20 && index < 26) }]
      return world
    })
    const analysis = analyze(result(frames))
    expect(analysis.windows[0].duration).toBeCloseTo(0.5)
    expect(analysis.windows[0].totalDuration).toBeCloseTo(0.8)
    expect(analysis.windows[0].intervals).toEqual([
      { start: 0, end: 0.5, playerId: 'receiver' },
      { start: 1, end: 1.3, playerId: 'receiver' },
    ])
    expect(analysis.windows[0].label).toBe('Perimeter receiver')
  })

  it('requires graph availability and geometric space, and keeps pass clearance separate from keep intent', () => {
    const world = frame(0)
    expect(isThreatOpen({ ...passOption(), available: false }, world, baseAssumptions)).toBe(false)
    expect(isThreatOpen({ ...passOption(), passClearance: -0.1 }, world, baseAssumptions)).toBe(false)
    expect(
      isThreatOpen({ ...passOption('ball-keep'), kind: 'keep', passClearance: -0.1 }, world, baseAssumptions),
    ).toBe(true)
    expect(isThreatOpen({ ...passOption(), influenceDistance: 0.1 }, world, baseAssumptions)).toBe(false)
  })

  it('compares each option with its modeled release horizon and elapsed commitment reaction', () => {
    const world = frame(1)
    const defender = world.players.find((player) => player.id === 'rotator')!
    defender.x = -2
    defender.z = 7
    world.players = [defender, world.players.find((player) => player.id === 'receiver')!]
    const option = { ...passOption(), timeToRelease: 0.9 }
    expect(isThreatOpen(option, world, baseAssumptions)).toBe(true)
    world.responsibilities = [{ ...commitment('spot-pass', -5, 2), startedAt: 0.5 }]
    expect(isThreatOpen(option, world, baseAssumptions)).toBe(false)
  })

  it('reports conceded and closed windows independently using authored names', () => {
    const make = (spotEnd: number, insideEnd: number) =>
      result(
        Array.from({ length: 41 }, (_, index) => {
          const world = frame(index * 0.05)
          world.options = [
            { ...passOption(), available: world.t < spotEnd },
            {
              ...passOption('inside-pass'),
              playerId: 'finisher',
              target: { x: 0, z: 2 },
              available: world.t < insideEnd,
            },
          ]
          return world
        }),
      )
    const change = compare(make(0.8, 0.2), make(0.2, 0.8))
    expect(change.tradeoffs.find((tradeoff) => tradeoff.id === 'spot-pass')?.direction).toBe('closes')
    expect(change.tradeoffs.find((tradeoff) => tradeoff.id === 'inside-pass')?.direction).toBe('opens')
    expect(change.explanation).toContain('Perimeter receiver closes')
    expect(change.explanation).toContain('interior finish opens')
  })

  it('falls back to an unknown authored ID without substituting a hero label', () => {
    const make = (available: boolean) =>
      result(
        [0, 0.05, 0.1, 0.15, 0.2].map((at) => ({
          ...frame(at),
          options: [{ ...passOption('new-option'), available }],
        })),
      )
    expect(analyze(make(true)).windows[0].label).toBe('new-option')
    expect(compare(make(true), make(false)).tradeoffs[0].label).toBe('new-option')
  })

  it('samples arrival at the actual frame clock when a trace begins after zero', () => {
    const run = result([1, 1.05, 1.1, 1.15, 1.2].map((at) => ({ ...frame(at), options: [passOption()] })))
    expect(analyze(run).arrival[0].at).toBeCloseTo(1.1)
  })

  it('reads assumptions from the exact input and leaves trace snapshots unchanged', () => {
    const run = result([0, 0.025, 0.05].map((at) => ({ ...frame(at), options: [passOption()] })))
    run.input.assumptions.gatherTime = 0.5
    const before = structuredClone(run)
    const analysis = analyze(run)
    expect(analysis.actionableHorizon).toBeCloseTo(0.65)
    expect(analysis.assumptions).toEqual(run.input.assumptions)
    expect(analysis.assumptions).not.toBe(run.input.assumptions)
    expect(run).toEqual(before)
  })
})

describe('launched ball evidence', () => {
  function launchedFrames(flight: BallFlight): WorldFrame[] {
    return Array.from({ length: 41 }, (_, index) => {
      const world = frame(index * 0.025)
      world.players.forEach((player) => {
        if (player.team === 'defense') {
          player.x = 6
          player.z = 6
        }
      })
      const defender = world.players.find((player) => player.id === 'rotator')!
      defender.x = 0
      defender.z = 3
      if (world.t >= flight.start && world.t <= flight.end) world.ball = { ...world.ball, phase: 'pass', flight }
      return world
    })
  }
  const flight: BallFlight = {
    from: 'initiator',
    to: 'receiver',
    start: 0.1,
    end: 0.7,
    a: { x: 0, y: 1.2, z: 0 },
    b: { x: 0, y: 1.2, z: 6 },
    kind: 'chest',
  }

  it('probes between motion frames and records the limiting defender', () => {
    const run = result(launchedFrames(flight))
    const evidence = analyzeFlights(run)[0]
    expect(evidence.sampleCount).toBeGreaterThan(100)
    expect(evidence.minClearance).toBeLessThan(0)
    expect(evidence.witness?.defenderId).toBe('rotator')
    expect(evidence.conditionalAfterContact).toBe(true)
    expect(analyze(run).classification).toBe('thin')
  })

  it('stops probes at the recorded contact and preserves the original launch plan', () => {
    const run = result(launchedFrames(flight))
    run.diagnostics.flightStops = [
      {
        flightStart: flight.start,
        at: 0.3,
        playerId: 'second-defender',
        part: 'palm',
        ball: { x: 0, y: 1.4, z: 2 },
        point: { x: 0, y: 1.4, z: 2 },
        clearance: -0.5,
      },
    ]
    const evidence = analyzeFlights(run)[0]
    expect(evidence.end).toBe(flight.end)
    expect(evidence.stoppedAt).toBe(0.3)
    expect(evidence.sampleCount).toBeLessThan(45)
    expect(evidence.witness?.t).toBe(0.3)
    expect(evidence.witness?.defenderId).toBe('second-defender')
    expect(evidence.conditionalAfterContact).toBe(true)
    expect(flight.end).toBe(0.7)
  })

  it('reports an unsupported empty horizon without invented windows or flight evidence', () => {
    const analysis = analyze(result([]))
    expect(analysis.windows).toEqual([])
    expect(analysis.flightEvidence).toEqual([])
    expect(analysis.classification).toBe('thin')
    expect(analysis.warnings).toContain('The replay horizon ends before the possession continuation is resolved.')
  })
})

it('splits a keep opening when possession changes and attributes the winning interval and arrival to its actor', () => {
  const frames = Array.from({ length: 21 }, (_, i) => frame(i * 0.1))
  for (const f of frames) {
    const playerId = f.t < 0.5 ? 'initiator' : 'finisher'
    f.options = [{ ...passOption('ball-keep'), kind: 'keep', playerId, target: { x: 0, z: 2 }, available: true }]
  }
  const analysis = analyze(result(frames)),
    window = analysis.windows.find((w) => w.id === 'ball-keep')!
  expect(window.intervals.map((i) => i.playerId)).toEqual(['initiator', 'finisher'])
  expect(window.playerId).toBe('finisher')
  const arrival = analysis.arrival.find((a) => a.threatId === 'ball-keep')!
  expect(arrival.playerId).toBe('finisher')
  expect(frames.find((f) => Math.abs(f.t - arrival.at) < 1e-9)!.options[0].playerId).toBe(arrival.playerId)
})
