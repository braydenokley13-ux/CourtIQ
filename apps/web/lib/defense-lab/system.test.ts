import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './scenario'
import { contradictions, emptySystem, resolveFor, saveToSystem, versionDiff } from './system'

const base = { name: 'Blue', situationId: 'high-pnr-middle', scope: 'varsity' as const, when: 'High P&R', presetIds: ['drop'], note: '', accepts: [] }

describe('Our System', () => {
  it('versions the same answer and keeps the exact executable config', () => {
    const c1 = createDefaultConfig()
    const first = saveToSystem(emptySystem(), { ...base, config: c1 })
    const c2 = { ...c1, answer: { ...c1.answer, tagDepth: 0.4 } }
    const second = saveToSystem(first.system, { ...base, name: 'blue ', config: c2 })
    expect(second.system.entries).toHaveLength(1)
    expect(second.version.v).toBe(2)
    expect(second.entry.versions[1].config.answer.tagDepth).toBe(0.4)
    expect(versionDiff(second.entry.versions[0], second.entry.versions[1])).toEqual(['tagDepth: 0.95 → 0.4'])
  })
  it('reports offense, assumption and cue changes, not "same rules"', () => {
    const c1 = createDefaultConfig()
    const s1 = saveToSystem(emptySystem(), { ...base, config: c1 })
    const c2 = { ...c1, opponent: { ...c1.opponent!, reject: !c1.opponent!.reject }, assumptions: { ...c1.assumptions, reactionDelay: 0.4 } }
    const s2 = saveToSystem(s1.system, { ...base, config: c2 })
    const diff = versionDiff(s2.entry.versions[0], s2.entry.versions[1])
    expect(diff.some(d => d.startsWith('offense reject'))).toBe(true)
    expect(diff.some(d => d.startsWith('assumption reactionDelay'))).toBe(true)
  })
  it('resolves level overrides over the program default and flags contradictions', () => {
    const c = createDefaultConfig()
    let sys = saveToSystem(emptySystem(), { ...base, scope: 'program', name: 'Blue', config: c }).system
    sys = saveToSystem(sys, { ...base, scope: 'jv', name: 'Green', config: c }).system
    expect(resolveFor(sys, 'high-pnr-middle', 'freshman')?.name).toBe('Blue')
    expect(resolveFor(sys, 'high-pnr-middle', 'jv')?.name).toBe('Green')
    sys = saveToSystem(sys, { ...base, scope: 'jv', name: 'Red', config: c }).system
    expect(contradictions(sys)).toHaveLength(1)
  })
})

describe('program voice', () => {
  it('plain keeps only our coverage names; program uses all our words', async () => {
    const { programVoice } = await import('./system')
    const terms = { drop: 'Blue', 'low-man': 'Helper' }
    expect(programVoice({ register: 'plain', terms })).toEqual({ register: 'plain', terms: { drop: 'Blue' } })
    expect(programVoice({ register: 'program', terms })).toEqual({ register: 'coach', terms })
  })
})
