import { describe, expect, it } from 'vitest'
import { analyze, compare } from '../analytics'
import { ATTACK_DOMAIN, attack } from '../attackCore'
import { findTeachingMoment, proposeFixesDetailed } from '../explore'
import { createDefaultConfig, HIGH_PNR_PROBLEM, PROBLEMS } from '../scenario'
import { simulate } from '../simulation'
import { getTagGuide } from '../tagGuide'
import type { LabConfig, PlayerId, SimulationResult } from '../types'
import { BASELINE_DRIVE_ANSWERS, BASELINE_DRIVE_PROBLEM } from './baselineDrive'

const configFor = (name: keyof typeof BASELINE_DRIVE_ANSWERS): LabConfig => {
  const base = createDefaultConfig()
  return { ...base, problemId: BASELINE_DRIVE_PROBLEM.id, counter: 'auto', answer: { ...base.answer, ...BASELINE_DRIVE_ANSWERS[name] } }
}
const runs: Record<string, SimulationResult> = {}
const run = (name: keyof typeof BASELINE_DRIVE_ANSWERS) => (runs[name] ??= simulate(configFor(name)))
const firstRead = (r: SimulationResult) => r.decisions.find(d => d.selected !== 'hold')!
const sameMotion = (a: SimulationResult, b: SimulationResult) => a.frames.length === b.frames.length && a.frames.every((f, i) => f.players.every((p, j) => Math.hypot(p.x - b.frames[i].players[j].x, p.z - b.frames[i].players[j].z) < 1e-6))

describe('baseline drive → drift, authored as content on the same primitives', () => {
  it('is installed beside the P&R and simulates with no screen, no roller', () => {
    expect(PROBLEMS.map(p => p.id)).toEqual([HIGH_PNR_PROBLEM.id, BASELINE_DRIVE_PROBLEM.id])
    const r = run('no-help')
    expect(r.problemVersion).toBe(BASELINE_DRIVE_PROBLEM.version)
    expect(r.diagnostics.boundaryBreach).toBe(false)
    expect(r.events.some(e => e.type === 'screen')).toBe(false)
    expect(r.frames[0].players.find(p => p.id === 'O1')).toMatchObject({ x: 4.6, z: 6.3 })
    // The offense reacts to what it observes: the corner player drifts once the drive is beaten.
    expect(r.events.some(e => e.type === 'counter' && /drifts to the corner/.test(e.label))).toBe(true)
    const o2 = (t: number) => r.frames.find(f => f.t >= t)!.players.find(p => p.id === 'O2')!
    expect(o2(1.5).z).toBeLessThan(o2(0).z - 0.5)
  })

  it('the help answer changes the offensive read: no help finishes, early help or a sagging corner defender kicks', () => {
    const none = run('no-help'), lowEarly = run('low-man-sinks-early'), big = run('big-stunts'), sag = run('strong-side-sags'), lowLate = run('low-man-sinks')
    expect(firstRead(none).selected).toBe('drive')
    expect(none.events.some(e => e.type === 'pass')).toBe(false)
    // Late help (waits for the beaten on-ball defender) arrives after the finish decision: it is no help.
    expect(firstRead(lowLate).selected).toBe('drive')
    // Weak-side low man or the big commits early: the offense skips to the weak wing.
    expect(firstRead(lowEarly)).toMatchObject({ selected: 'lift', actorId: 'O1' })
    expect(firstRead(big).selected).toBe('lift')
    expect(lowEarly.events.find(e => e.type === 'pass')?.label).toMatch(/Skip/)
    // The drifter's own defender sags: the corner is the kick.
    expect(firstRead(sag)).toMatchObject({ selected: 'strong', actorId: 'O1' })
    expect(sag.events.find(e => e.type === 'pass')?.targetId).toBe('O2')
    // Different answers produce different bodies, not only different labels.
    expect(sameMotion(none, lowEarly)).toBe(false)
  })

  it('teaching states: each defender changes obligation as help, rotation and recovery unfold', () => {
    const r = run('low-man-sinks-early')
    const primary = (id: PlayerId) => {
      const kinds: string[] = []
      for (const f of r.frames) {
        const task = f.responsibilities.filter(t => t.defenderId === id).sort((a, b) => b.priority - a.priority)[0]
        const label = task ? `${task.kind}:${task.threatId}` : 'none'
        if (kinds.at(-1) !== label) kinds.push(label)
      }
      return kinds
    }
    expect(primary('D1')).toEqual(expect.arrayContaining(['contain:drive', 'chase:drive']))
    expect(primary('D3')).toEqual(expect.arrayContaining(['guard:corner', 'tag:drive']))
    expect(primary('D4')).toEqual(expect.arrayContaining(['guard:lift', 'closeout:corner']))
    expect(primary('D2')).toEqual(['guard:strong'])
    const tag = r.events.find(e => e.type === 'tag')!
    expect(tag).toMatchObject({ playerId: 'D3', targetId: 'O1', threatId: 'drive' })
    expect(tag.label).not.toMatch(/roll/i)
    expect(r.events.filter(e => e.type === 'transfer').map(e => e.playerId)).toEqual(expect.arrayContaining(['D3', 'D4']))
    // The three helper identities are distinct teaching states.
    expect(run('big-stunts').events.find(e => e.type === 'tag')?.playerId).toBe('D5')
    expect(run('strong-side-sags').events.find(e => e.type === 'tag')?.playerId).toBe('D2')
    expect(run('no-help').events.some(e => e.type === 'tag')).toBe(false)
  })

  it('windows and teaching moment name the helper and the opening it created', () => {
    const none = analyze(run('no-help')), sag = analyze(run('strong-side-sags')), low = analyze(run('low-man-sinks-early'))
    const dur = (a: typeof none, id: string) => a.windows.find(w => w.id === id)?.duration ?? 0
    expect(dur(none, 'drive')).toBeGreaterThan(0.5)
    expect(dur(low, 'lift')).toBeGreaterThan(0.1)
    expect(dur(sag, 'strong')).toBeGreaterThan(0)
    expect(dur(none, 'lift')).toBe(0)
    expect(compare(run('no-help'), run('low-man-sinks-early')).tradeoffs.find(t => t.id === 'lift')?.direction).toBe('opens')

    const moment = findTeachingMoment(run('low-man-sinks-early'))!
    expect(moment.cause).toBe('late-rotation')
    expect(moment.pulledDefenderId).toBe('D3')
    expect(moment.involved).toEqual(expect.arrayContaining(['D3', 'O4']))
    const sagMoment = findTeachingMoment(run('strong-side-sags'))!
    expect(sagMoment).toMatchObject({ threatId: 'strong', receiverId: 'O2', pulledDefenderId: 'D2' })
    expect(findTeachingMoment(run('no-help'))?.pulledDefenderId).toBeUndefined()
  })

  it('explore fixes: replayed answers are real, P&R-only levers are reported ineffective, not silently applied', () => {
    const report = proposeFixesDetailed(configFor('low-man-sinks-early'), null)
    // Catalog entries that only write answer fields the content reads produce real, different replays.
    expect(report.fixes.map(f => f.id)).toEqual(expect.arrayContaining(['keep', 'stay-home']))
    for (const fix of report.fixes.filter(f => f.id !== 'keep')) expect(sameMotion(run('low-man-sinks-early'), fix.result)).toBe(false)
    // bigDepth/tagDepth are read only by the P&R policy: honest "no effect", not a fake recommendation.
    expect(report.ineffective.map(f => f.id)).toEqual(expect.arrayContaining(['help-less', 'big-higher', 'big-lower']))
    // The catalog has no entry that turns help ON (every help lever requires tag:true), so from "no help"
    // it can propose nothing that changes the help: a generalization gap, recorded in reusability.md.
    expect(proposeFixesDetailed(configFor('no-help'), null).fixes.map(f => f.id)).toEqual(['keep'])
  })

  it('attack search runs mechanically, but its domain is P&R: only lift spacing moves a body here', () => {
    const config = { ...configFor('low-man-sinks-early') }
    const base = simulate(config), opponent = config.opponent!
    const moved = ATTACK_DOMAIN.filter(entry => {
      const next = simulate({ ...config, opponent: { ...opponent, [entry.parameter]: entry.parameter === 'liftWidth' ? 0.35 : entry.max } })
      return !sameMotion(base, next)
    }).map(entry => entry.parameter)
    expect(moved).toEqual(['liftWidth'])
    const permissionsInert = (['reject', 'rescreen', 'shortRoll'] as const).every(key => sameMotion(base, simulate({ ...config, opponent: { ...opponent, [key]: !opponent[key] } })))
    expect(permissionsInert).toBe(true)
    const report = attack(config, { budget: 8 })
    expect(report.baseline.result.problemVersion).toBe(BASELINE_DRIVE_PROBLEM.version)
    expect(report.budget.used).toBeGreaterThan(0)
    // The scope sentence and intent labels are authored for the P&R.
    expect(report.scope).toMatch(/high-P&R/)
  }, 60_000)

  it('tag guide is correctly unavailable: the draggable tag rail is a screen-tag concept', () => {
    const r = run('low-man-sinks-early')
    const frame = r.frames.find(f => f.t >= 1)!
    const guide = getTagGuide(frame, r.config.answer, BASELINE_DRIVE_PROBLEM, r.config)
    expect(guide.defenderId).toBe('D3')
    expect(guide.editable).toBe(false)
    expect(guide.mode).toBe('unavailable')
  })
})
