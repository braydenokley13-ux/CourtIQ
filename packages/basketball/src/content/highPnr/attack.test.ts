import { describe, expect, it, vi } from 'vitest'
import {
  attack,
  attackYielding,
  findAttackWitness,
  attackExecutionUnresolved,
  previewAttackCandidate,
} from './attackCore'
import { createDefaultConfig } from './scenario'
import { DEFAULT_OPPONENT } from './offensivePolicy'
import { simulate } from '../../simulation/facade'
import { isThreatOpen } from '../../queries/analytics'

const config = () => ({ ...createDefaultConfig(), opponent: { ...DEFAULT_OPPONENT } })

describe('bounded adversarial opponent search', () => {
  it('rejects legacy inputs without silently enabling an adaptive opponent', async () => {
    const legacy = createDefaultConfig()
    delete legacy.opponent
    const original = JSON.stringify(legacy)
    const progress = vi.fn()
    expect(() => attack(legacy, { onProgress: progress })).toThrow(
      'Enable the adaptive opponent before searching for counters.',
    )
    await expect(attackYielding(legacy, { onProgress: progress })).rejects.toThrow(
      'Enable the adaptive opponent before searching for counters.',
    )
    expect(progress).not.toHaveBeenCalled()
    expect(JSON.stringify(legacy)).toBe(original)
    expect(legacy.opponent).toBeUndefined()
  })
  it('replays the exact baseline, explores real parameter edits, stays deterministic and respects its budget', () => {
    const input = config(),
      original = JSON.stringify(input)
    const a = attack(input, { budget: 16 }),
      b = attack(input, { budget: 16 })
    expect(a).toEqual(b)
    expect(JSON.stringify(input)).toBe(original)
    expect(a.baseline.result).toEqual(simulate(input))
    expect(a.budget.used).toBeLessThanOrEqual(16)
    expect(a.candidates.length).toBeGreaterThan(8)
    expect(a.candidates.some((candidate) => candidate.changes.length === 2)).toBe(true)
    for (const candidate of a.candidates) {
      expect(candidate.changes.length).toBeLessThanOrEqual(2)
      expect(candidate.opponent.screenAngle).toBeGreaterThanOrEqual(-0.65)
      expect(candidate.opponent.screenAngle).toBeLessThanOrEqual(0.65)
      expect(candidate.opponent.liftDelay).toBeGreaterThanOrEqual(-0.25)
      expect(candidate.opponent.liftDelay).toBeLessThanOrEqual(0.6)
    }
    if (a.baseline.witness && !a.baseline.witness.conditional) expect(a.selected.changes).toEqual([])
    expect(a.selected.config.answer).toEqual(input.answer)
    expect(a.selected.config.seed).toBe(input.seed)
    expect(a.sensitivity).toHaveLength(2)
  }, 20000)
  it('anchors evidence to an earliest executable open frame inside an actionable interval', () => {
    const report = attack(config(), { budget: 12 })
    const witness = findAttackWitness(report.selected.result)
    expect(witness).not.toBeNull()
    if (!witness) return
    const frame = report.selected.result.frames.find((frame) => Math.abs(frame.t - witness.at) < 1e-8)!
    const option = frame.options.find((option) => option.id === witness.threatId)!
    expect(isThreatOpen(option, frame, report.assumptions)).toBe(true)
    expect(witness.target).toEqual(option.target)
    expect(witness.at).toBeGreaterThanOrEqual((option.readAvailableAt ?? witness.interval.start) - 1e-8)
    expect(witness.at).toBeLessThan(witness.interval.end)
    expect(witness.leadSeconds).toBeGreaterThan(0)
    expect(witness.interval.end - witness.interval.start).toBeGreaterThan(report.selected.analysis.actionableHorizon)
    expect(witness.chain.every((event) => event.t <= witness.at + 1e-8)).toBe(true)
  }, 20000)
  it.each(['blitz', 'switch', 'hedge'] as const)(
    'rejects forecast openings that close before the permitted read against %s',
    (coverage) => {
      const input = config()
      input.answer.coverage = coverage
      input.assumptions.reactionDelay = 0.8
      input.opponent.rescreen = true
      const result = simulate(input)
      const witness = findAttackWitness(result)
      // These defensive reactions expose forecast roll windows before 2.10 s,
      // but the handler cannot read until they have already closed.
      if (witness) {
        const frame = result.frames.find((frame) => Math.abs(frame.t - witness.at) < 1e-8)!
        const option = frame.options.find((option) => option.id === witness.threatId)!
        expect(witness.at).toBeGreaterThanOrEqual((option.readAvailableAt ?? 0) - 1e-8)
        expect(witness.at).toBeLessThan(witness.interval.end)
        expect(isThreatOpen(option, frame, input.assumptions)).toBe(true)
        expect(witness.threatId !== 'roll' || witness.at >= 2.1 - 1e-8).toBe(true)
      }
      const inaccessible = {
        ...result,
        frames: result.frames.map((frame) => ({
          ...frame,
          options: frame.options.map((option) => ({ ...option, readAvailableAt: input.assumptions.duration + 1 })),
        })),
      }
      expect(findAttackWitness(inaccessible)).toBeNull()
    },
  )
  it('requires an actual permitted read, not just an elapsed timestamp', () => {
    const input = config()
    input.startingPositions = { O1: { x: 7, z: 14 } }
    const result = simulate(input)
    expect(result.decisions).toHaveLength(0)
    expect(findAttackWitness(result)).toBeNull()
  })
  it('treats a defensive movement cue as an answer edit in paired retests', () => {
    const input = config(),
      previous = attack(input, { budget: 6 })
    const current = {
      ...input,
      interventions: [
        {
          id: 'coach-low-man',
          at: 0.5,
          kind: 'move' as const,
          playerId: 'D3' as const,
          target: { x: -6, z: 7 },
          until: 4,
        },
      ],
    }
    const report = attack(current, { budget: 6, previousReport: previous })
    expect(report.pairedRetest?.sameExperiment).toBe(true)
    expect(report.pairedRetest?.current.analysis.windows).not.toEqual(previous.selected.analysis.windows)
    const offensiveCue = { ...current, interventions: [{ ...current.interventions[0], playerId: 'O3' as const }] }
    expect(attack(offensiveCue, { budget: 6, previousReport: previous }).pairedRetest?.sameExperiment).toBe(false)
  }, 20000)
  it('retests the previous opponent against a changed answer and flags changed assumptions', () => {
    const input = config(),
      previous = attack(input, { budget: 6 })
    const current = { ...input, answer: { ...input.answer, tag: false } }
    const report = attack(current, { budget: 6, previousReport: previous })
    expect(report.pairedRetest?.sameExperiment).toBe(true)
    expect(report.pairedRetest?.current.config.opponent).toEqual(previous.selected.opponent)
    expect(report.pairedRetest?.current.config.answer.tag).toBe(false)
    expect(report.pairedRetest?.current.result).toEqual(simulate({ ...current, opponent: previous.selected.opponent }))
    expect(
      attack({ ...current, seed: current.seed + 1 }, { budget: 6, previousReport: previous }).pairedRetest
        ?.sameExperiment,
    ).toBe(false)
  }, 20000)
})

it('streams at most eight actual replay paths and ends with the exact selected witness', () => {
  const input = config()
  const previews: import('./attackCore').AttackPreview[] = []
  const report = attack(input, { onCandidate: (candidate) => previews.push(candidate) })
  expect(report.budget.limit).toBe(28)
  expect(report.budget.used).toBeLessThanOrEqual(28)
  expect(previews.length).toBeGreaterThan(1)
  expect(previews.length).toBeLessThanOrEqual(8)
  const selected = previews[previews.length - 1]
  expect(selected.selected).toBe(true)
  expect(selected.id).toBe(report.selected.id)
  expect(selected.witnessAt).toBe(report.selected.witness?.at ?? null)
  expect(selected.verdict).toBe(
    report.selected.witness
      ? report.selected.witness.conditional
        ? 'conditional'
        : 'exposed'
      : attackExecutionUnresolved(report.selected.result)
        ? 'conditional'
        : 'held',
  )
  const unresolved = previewAttackCandidate(
    {
      ...report.selected,
      witness: null,
      result: {
        ...report.selected.result,
        diagnostics: { ...report.selected.result.diagnostics, missedCatchCount: 1 },
      },
    },
    1,
  )
  expect(unresolved.verdict).toBe('conditional')
  expect(unresolved.witnessAt).toBeNull()
  expect(unresolved.executionUnresolved).toBe(true)
  for (const preview of previews) {
    const candidate = report.candidates.find((candidate) => candidate.id === preview.id)!
    expect(candidate).toBeDefined()
    const replay = preview.selected ? report.selected.result : simulate({ ...input, opponent: candidate.opponent })
    expect(preview.points.length).toBeLessThanOrEqual(33)
    expect(preview.points.length).toBeGreaterThan(1)
    expect(preview.replays).toBeLessThanOrEqual(report.budget.used)
    for (const point of preview.points) {
      expect(
        replay.frames.some(
          (frame) =>
            frame.t <= (preview.witnessAt ?? input.assumptions.duration) + 1e-8 &&
            frame.players.some(
              (player) => player.id === preview.playerId && player.x === point.x && player.z === point.z,
            ),
        ),
      ).toBe(true)
    }
  }
}, 20000)
