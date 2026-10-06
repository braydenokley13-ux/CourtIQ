import { describe, expect, it } from 'vitest'
import { createAnswer, exportAnswers, importAnswers, parseLabConfig } from './answers'
import { coachRuleSentence, compileCoachRules } from './coachRules'
import { defenseResponsibilities } from './defensivePolicy'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { frameAt, simulate } from './simulation'
import { getTagGuide } from './tagGuide'
import type { CoachRule, LabConfig, WorldFrame } from './types'

const rollerRule: CoachRule = { kind: 'roller-depth', depth: 6.5, response: 'big-recovers' }
const liftRule: CoachRule = { kind: 'lift-rise', rise: 1, response: 'x-out' }
function observation(): WorldFrame {
  const config = createDefaultConfig()
  return {
    t: 1,
    players: HIGH_PNR_PROBLEM.players.map(p => ({ ...p, ...p.start, ...(p.id === 'O5' ? { z: 5 } : {}), vx: 0, vz: p.id === 'O5' ? -2 : 0, yaw: 0, pose: { stance: 'ready', hands: 0, phase: 0, jump: 0 } })),
    ball: { x: 1.6, z: 8.4, y: 1, phase: 'handle', owner: 'O1', receiver: null, flight: null },
    responsibilities: [], options: [], answer: config.answer, stage: 'screen', screenEngagedAt: 0.4,
  }
}
function responsibilities(config: LabConfig, frame = observation()) {
  return defenseResponsibilities(frame, config.answer, HIGH_PNR_PROBLEM, config, frame.t, { screenAt: frame.screenEngagedAt ?? null, showReleased: false })
}

describe('bounded coach-owned conditional rules', () => {
  it('waits for the real screen and observed roller threshold, then transfers both obligations', () => {
    const config = createDefaultConfig(), frame = observation()
    config.answer.coachRules = [rollerRule]
    const hasRule = () => responsibilities(config, frame).some(r => r.trigger === coachRuleSentence(rollerRule))
    delete frame.screenEngagedAt
    expect(hasRule()).toBe(false)
    frame.screenEngagedAt = 1.2
    expect(hasRule()).toBe(false)
    frame.screenEngagedAt = 0.4
    frame.players.find(p => p.id === 'O5')!.z = 6.5
    expect(hasRule()).toBe(false)
    frame.players.find(p => p.id === 'O5')!.z = 6.49
    const resolved = responsibilities(config, frame)
    expect(resolved.find(r => r.defenderId === 'D5')).toMatchObject({ offensivePlayerId: 'O5', kind: 'recover', threatId: 'roll' })
    expect(resolved.filter(r => r.defenderId === 'D3')).toHaveLength(1)
    expect(resolved.find(r => r.defenderId === 'D3')).toMatchObject({ offensivePlayerId: 'O3', kind: 'recover', threatId: 'corner' })
    frame.ball = { ...frame.ball, phase: 'pass', owner: null, receiver: 'O4' }
    expect(hasRule()).toBe(false)
  })

  it('uses the same executable tag depth for a coach-authored tag response', () => {
    const config = createDefaultConfig()
    config.answer = { ...config.answer, tag: false, tagDepth: 0.32, coachRules: [{ kind: 'roller-depth', depth: 6.5, response: 'low-man-tags' }] }
    const resolved = responsibilities(config)
    expect(resolved.find(r => r.defenderId === 'D3')).toMatchObject({ kind: 'tag', offensivePlayerId: 'O5' })
    expect(resolved.find(r => r.defenderId === 'D5')).toMatchObject({ kind: 'contain', offensivePlayerId: 'O1' })
    const guide = getTagGuide(observation(), config.answer, HIGH_PNR_PROBLEM, config)
    expect(guide.editable).toBe(true)
    expect(guide.currentTarget).toEqual(resolved.find(r => r.defenderId === 'D3')!.target)
  })

  it('measures lift from the actual starting spot and makes a complete three-person X-out', () => {
    const config = createDefaultConfig(), frame = observation()
    config.startingPositions = { O4: { x: -5, z: 7 } }
    config.answer.coachRules = [liftRule]
    frame.players.find(p => p.id === 'O4')!.z = 7.9
    expect(responsibilities(config, frame).some(r => r.trigger === coachRuleSentence(liftRule))).toBe(false)
    frame.players.find(p => p.id === 'O4')!.z = 8.1
    const resolved = responsibilities(config, frame)
    expect(resolved.find(r => r.defenderId === 'D4')).toMatchObject({ offensivePlayerId: 'O3', kind: 'closeout' })
    expect(resolved.find(r => r.defenderId === 'D3')).toMatchObject({ offensivePlayerId: 'O4', kind: 'closeout' })
    expect(resolved.find(r => r.defenderId === 'D5')).toMatchObject({ offensivePlayerId: 'O5', kind: 'recover' })
    // Re-observing the exchanged assignments must not toggle the rule off.
    frame.responsibilities = resolved
    expect(responsibilities(config, frame)).toEqual(resolved)
  })

  it('keeps switch assignments and resolves simultaneous coaching sentences in stable basketball order', () => {
    const config = createDefaultConfig(), frame = observation()
    frame.players.find(p => p.id === 'O4')!.z = 7
    config.answer.coachRules = [liftRule, { kind: 'roller-depth', depth: 6.5, response: 'low-man-tags' }]
    const first = responsibilities(config, frame)
    config.answer.coachRules.reverse()
    expect(responsibilities(config, frame)).toEqual(first)
    expect(first.find(r => r.defenderId === 'D3')!.offensivePlayerId).toBe('O4')
    config.answer.coverage = 'switch'
    expect(compileCoachRules(config.answer, HIGH_PNR_PROBLEM, config)).toEqual([])
    expect(responsibilities(config, frame).find(r => r.defenderId === 'D1')!.offensivePlayerId).toBe('O5')
    expect(responsibilities(config, frame).some(r => r.trigger.startsWith('After the screen'))).toBe(false)
  })

  it('changes execution only after the observation, without moving bodies instantly, and survives export/import', () => {
    const config = createDefaultConfig()
    const baseline = simulate(config)
    const coached = { ...config, answer: { ...config.answer, coachRules: [rollerRule] } }
    const run = simulate(coached)
    const activated = run.frames.find(f => f.responsibilities.some(r => r.trigger === coachRuleSentence(rollerRule)))!
    expect(activated).toBeDefined()
    for (const frame of run.frames.filter(f => f.t < activated.t)) {
      expect(frame.players).toEqual(baseline.frames.find(f => f.t === frame.t)!.players)
      expect(frame.responsibilities).toEqual(baseline.frames.find(f => f.t === frame.t)!.responsibilities)
    }
    const after = run.frames.find(f => f.t > activated.t + 0.3)!
    expect(after.players.find(p => p.id === 'D3')).not.toEqual(baseline.frames.find(f => f.t === after.t)!.players.find(p => p.id === 'D3'))
    const atIndex = run.frames.indexOf(activated)
    for (const p of activated.players) {
      const before = run.frames[atIndex - 1].players.find(q => q.id === p.id)!
      expect(Math.hypot(p.x - before.x, p.z - before.z)).toBeLessThanOrEqual(config.assumptions.maxSpeed * config.assumptions.dt + 1e-8)
    }
    const record = createAnswer({ name: 'Our roller handoff', config: coached })
    let stored: string | null = null
    const imported = importAnswers(exportAnswers([record]), { getItem: () => stored, setItem: (_key, value) => { stored = value } })
    expect(imported.persisted).toBe(true)
    expect(imported.answers[0].config.answer.coachRules).toEqual([rollerRule])
    expect(simulate(imported.answers[0].config)).toEqual(run)
  })

  it('preserves legacy absence and strictly rejects out-of-range, duplicate, and role-incompatible sentences', () => {
    const config = createDefaultConfig()
    expect(parseLabConfig(config).answer).not.toHaveProperty('coachRules')
    const parse = (rules: unknown[]) => parseLabConfig({ ...config, answer: { ...config.answer, coachRules: rules } })
    expect(() => parse([{ ...rollerRule, depth: 8 }])).toThrow()
    expect(() => parse([{ ...liftRule, rise: NaN }])).toThrow()
    expect(() => parse([rollerRule, rollerRule])).toThrow()
    expect(() => parse([{ ...rollerRule, response: 'x-out' }])).toThrow()
    expect(() => parse([{ ...rollerRule, defender: 'ballhandler' }])).toThrow()
    const invalid = { ...config.answer, coachRules: [{ ...rollerRule, depth: Infinity }] }
    expect(() => compileCoachRules(invalid, HIGH_PNR_PROBLEM, config)).toThrow()
  })

  it('reports the actual overriding rule and clears its provenance when the base tag resumes on release', () => {
    const config = createDefaultConfig(), frame = observation()
    config.answer = { ...config.answer, recovery: 'roller-secured', coachRules: [{ kind: 'roller-depth', depth: 6.5, response: 'low-man-tags' }] }
    Object.assign(frame.players.find(p => p.id === 'D5')!, { x: 3, z: 6 })
    const coached = responsibilities(config, frame)
    expect(coached.find(r => r.defenderId === 'D3')).toMatchObject({ kind: 'tag', sourceRuleId: 'coach-roller-depth' })
    expect(coached.find(r => r.defenderId === 'D5')).toMatchObject({ kind: 'contain', sourceRuleId: 'coach-roller-depth' })
    expect(coached.find(r => r.defenderId === 'D2')!.sourceRuleId).toBe('protect-strong-spacing')
    expect(coached.find(r => r.defenderId === 'D1')).not.toHaveProperty('sourceRuleId')

    // Handler release ends the conditional sentence, not necessarily the tag:
    // the ordinary roller-secured answer still owns that basketball decision.
    frame.ball = { ...frame.ball, phase: 'pass', owner: null, receiver: 'O4' }
    const resumed = responsibilities(config, frame)
    expect(resumed.find(r => r.defenderId === 'D3' && r.kind === 'tag')).toBeDefined()
    expect(resumed.filter(r => r.defenderId === 'D3').every(r => r.sourceRuleId === undefined)).toBe(true)
    expect(resumed.some(r => r.sourceRuleId === 'coach-roller-depth')).toBe(false)
  })

  it('keeps provenance independent of sentence text and records the winning exchange rule', () => {
    const config = createDefaultConfig(), frame = observation()
    const problem = { ...HIGH_PNR_PROBLEM, defenseRules: HIGH_PNR_PROBLEM.defenseRules!.map(rule => ({ ...rule, label: 'Our team wording' })) }
    const renamed = defenseResponsibilities(frame, config.answer, problem, config, frame.t)
    expect(renamed.find(r => r.defenderId === 'D2')).toMatchObject({ trigger: 'Our team wording', sourceRuleId: 'protect-strong-spacing' })
    frame.players.find(p => p.id === 'O4')!.z = 7
    config.answer.coachRules = [rollerRule, liftRule]
    const exchanged = responsibilities(config, frame)
    for (const id of ['D3', 'D4', 'D5']) expect(exchanged.find(r => r.defenderId === id)!.sourceRuleId).toBe('coach-lift-rise')
  })

  it('isolates nested coach rules across replay frames, interventions, presentation samples and input', () => {
    const config = createDefaultConfig()
    config.answer.coachRules = [{ ...rollerRule }]
    config.interventions = [{ id: 'new-read', kind: 'answer', at: 1, patch: { coachRules: [{ ...liftRule }] } }]
    const original = JSON.parse(JSON.stringify(config)) as LabConfig
    const run = simulate(config)
    const firstRules = run.frames[0].answer.coachRules!
    if (firstRules[0].kind === 'roller-depth') firstRules[0].depth = 3
    firstRules.push({ ...liftRule })
    expect(run.frames[1].answer.coachRules).toEqual([rollerRule])

    const afterIndex = run.frames.findIndex(frame => frame.t === 1)
    const afterRules = run.frames[afterIndex].answer.coachRules!
    if (afterRules[0].kind === 'lift-rise') afterRules[0].rise = 2.5
    afterRules.push({ ...rollerRule })
    expect(run.frames[afterIndex + 1].answer.coachRules).toEqual([liftRule])

    const sampled = frameAt(run, run.frames[1].t)
    if (sampled.answer.coachRules![0].kind === 'roller-depth') sampled.answer.coachRules![0].depth = 4
    sampled.answer.coachRules!.push({ ...liftRule })
    expect(run.frames[1].answer.coachRules).toEqual([rollerRule])
    expect(run.config).toEqual(original)
    expect(config).toEqual(original)
  })
})
