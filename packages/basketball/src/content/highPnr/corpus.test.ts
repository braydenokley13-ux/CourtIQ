import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './scenario'
import { simulate } from '../../simulation/facade'
import type { RoleId, ThreatId } from './types'
import {
  ANSWERS,
  COLLISIONS,
  CONCEPTS,
  GOALS,
  ROLE_NAMES,
  SITUATIONS,
  answerById,
  applyAnswers,
  describeThreat,
  describeTradeoff,
  explainMoment,
  findJargon,
  formatSeconds,
  readySubSituations,
  roleName,
  term,
  COACH_ONLY_TERMS,
  type MomentCause,
  type Voice,
} from './index'

const plain: Voice = { register: 'plain' }
const coach: Voice = { register: 'coach' }
const threats: ThreatId[] = ['drive', 'roll', 'pop', 'corner', 'lift', 'strong']
const causes: MomentCause[] = [
  'deep-tag',
  'late-rotation',
  'switch-mismatch',
  'two-on-ball',
  'big-too-deep',
  'big-too-high',
  'unknown',
]
const roles = Object.keys(ROLE_NAMES) as RoleId[]

describe('answers', () => {
  it('ids are unique and patches are within engine ranges', () => {
    expect(new Set(ANSWERS.map((a) => a.id)).size).toBe(ANSWERS.length)
    for (const a of ANSWERS) {
      const p = a.patch
      if (p.bigDepth !== undefined) expect(p.bigDepth >= 1.5 && p.bigDepth <= 6).toBe(true)
      if (p.tagDepth !== undefined) expect(p.tagDepth >= 0 && p.tagDepth <= 1).toBe(true)
      expect(Object.keys(p).length).toBeGreaterThan(0)
    }
  })
  it.each(ANSWERS.map((a) => [a.id]))('%s simulates without throwing', (id) => {
    const base = createDefaultConfig()
    const answer = { ...base.answer, ...answerById(id)!.patch }
    const result = simulate({ ...base, answer })
    expect(result.frames.length).toBeGreaterThan(10)
  })
  it('every pairing of a coverage and a helper preset simulates', () => {
    const base = createDefaultConfig()
    for (const c of ANSWERS.filter((a) => a.kind === 'coverage'))
      for (const h of ANSWERS.filter((a) => a.kind === 'helper')) {
        expect(() => simulate({ ...base, answer: applyAnswers(base.answer, [c.id, h.id]) })).not.toThrow()
      }
  })
  it('has plain and coach text for names, descriptions and tradeoffs', () => {
    for (const a of ANSWERS)
      for (const s of [
        a.plainName,
        a.coachName,
        a.plainDescription,
        a.coachDescription,
        a.gives.plain,
        a.gives.coach,
        a.takes.plain,
        a.takes.coach,
        a.fidelity.note,
      ])
        expect(s.trim().length).toBeGreaterThan(2)
  })
  it('documents alias collisions with real answer ids', () => {
    for (const c of COLLISIONS) {
      expect(c.meanings.length).toBeGreaterThan(1)
      for (const m of c.meanings) expect(answerById(m.answerId)).toBeDefined()
    }
  })
  it('flags ICE as an approximation', () => {
    expect(answerById('ice')!.fidelity.level).toBe('approximate')
  })
})

describe('goals and situations', () => {
  it('goals reference existing answers, each once', () => {
    for (const g of GOALS) {
      expect(new Set(g.answers.map((a) => a.answerId)).size).toBe(g.answers.length)
      for (const a of g.answers) {
        expect(answerById(a.answerId)).toBeDefined()
        expect(a.why.length).toBeGreaterThan(5)
      }
      if (g.mode !== 'custom') expect(g.answers.length).toBeGreaterThan(0)
    }
    expect(GOALS.some((g) => g.mode === 'custom')).toBe(true)
  })
  it('only high middle P&R is ready', () => {
    expect(readySubSituations().map((s) => s.id)).toEqual(['high-pnr-middle'])
    expect(SITUATIONS.filter((s) => s.status === 'ready').map((s) => s.id)).toEqual(['ball-screens'])
    expect(readySubSituations()[0].engineProblemId).toBe('high-pnr-weakside-lift')
  })
})

describe('concepts and roles', () => {
  it('every concept has plain, coach and definition', () => {
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length)
    for (const c of CONCEPTS) {
      expect(c.plain).toBeTruthy()
      expect(c.coach).toBeTruthy()
      expect(c.definition.length).toBeGreaterThan(10)
    }
    for (const id of [
      'low-man',
      'tag',
      'lift',
      'x-out',
      'skip-pass',
      'closeout',
      'roller',
      'pocket-pass',
      'short-roll',
      'pop',
      'reject',
      'rotation',
      'help',
      'recover',
      'stunt',
      'poa',
      'screen-defender',
      'weak-side',
      'strong-side',
      'corner',
      'nail',
    ])
      expect(CONCEPTS.some((c) => c.id === id)).toBe(true)
  })
  it('role names exist in both registers', () => {
    expect(roles.length).toBe(10)
    for (const r of roles) {
      expect(ROLE_NAMES[r].plain).toBeTruthy()
      expect(ROLE_NAMES[r].coach).toBeTruthy()
    }
    expect(roleName('poa', plain)).toBe('the ball defender')
    expect(roleName('low-man', plain)).toBe('the helper under the basket')
  })
})

describe('plain register has no coach-only jargon', () => {
  const strings: string[] = []
  for (const a of ANSWERS) strings.push(a.plainName, a.plainDescription, a.gives.plain, a.takes.plain)
  for (const g of GOALS) strings.push(g.plain, g.meaning, ...g.answers.map((a) => a.why))
  for (const c of CONCEPTS) strings.push(c.plain, c.definition)
  for (const r of roles) strings.push(ROLE_NAMES[r].plain)
  for (const s of SITUATIONS)
    strings.push(
      s.plainTitle,
      s.plainDescription,
      ...(s.subSituations ?? []).flatMap((x) => [x.plainTitle, x.plainDescription]),
    )
  it.each(strings.map((s) => [s]))('%s', (s) => {
    expect(findJargon(s)).toBeNull()
  })
  it('generated plain sentences are jargon-free', () => {
    for (const t of threats) {
      expect(findJargon(describeThreat(t, plain, { responsibleRole: 'low-man' }))).toBeNull()
      for (const cause of causes) {
        const m = explainMoment(
          {
            threatId: t,
            openFor: 0.58,
            defenderNeeds: 0.91,
            responsibleRole: 'backside',
            pulledRole: 'low-man',
            cause,
          },
          plain,
        )
        expect(findJargon(`${m.headline} ${m.body} ${m.numbers.join(' ')}`)).toBeNull()
      }
    }
    for (const a of threats)
      for (const b of threats) {
        expect(
          findJargon(
            describeTradeoff(
              [
                { threatId: a, before: 0.5, after: 0 },
                { threatId: b, before: 0, after: 0.5 },
              ],
              plain,
            ),
          ),
        ).toBeNull()
      }
  })
  it('the jargon detector works', () => {
    expect(COACH_ONLY_TERMS.length).toBeGreaterThan(20)
    expect(findJargon('The low man tags the roller')).not.toBeNull()
    expect(findJargon('Then X-out and lift')).not.toBeNull()
    expect(findJargon('The helper under the basket steps over')).toBeNull()
  })
})

describe('term and team terminology', () => {
  it('returns each register', () => {
    expect(term('x-out', plain)).toBe('far-side defenders swapping players')
    expect(term('x-out', coach)).toBe('X-out')
    expect(term('drop', plain)).toBe('Keep the big back')
    expect(term('drop', coach)).toBe('Drop')
    expect(term('unknown-id', plain)).toBe('unknown-id')
  })
  it('applies team overrides in both registers and ignores blanks', () => {
    for (const reg of ['plain', 'coach'] as const)
      expect(term('drop', { register: reg, terms: { drop: 'Blue' } })).toBe('Blue')
    expect(term('drop', { register: 'coach', terms: { drop: '  ' } })).toBe('Drop')
    expect(term('low-man', { register: 'plain', terms: { 'low-man': 'Nail' } })).toBe('Nail')
  })
  it('uses team terms in explanations', () => {
    const v: Voice = { register: 'coach', terms: { 'low-man': 'Tom', 'x-out': 'Cross', tag: 'Tag-up', lift: 'Wing' } }
    const m = explainMoment({ threatId: 'lift', openFor: 0.58, cause: 'deep-tag' }, v)
    expect(m.headline).toBe('Deep Tom Tag-up exposes the Wing before the Cross arrives.')
    const p = explainMoment(
      { threatId: 'roll', openFor: 0.4, cause: 'deep-tag' },
      { register: 'plain', terms: { 'low-man': 'Tom' } },
    )
    expect(p.body).toContain('Your Tom')
  })
})

describe('explainMoment', () => {
  it('matches the plain and coach examples', () => {
    const p = explainMoment({ threatId: 'lift', openFor: 0.58, defenderNeeds: 0.91 }, plain)
    expect(p.headline).toBe('Their shooter is open.')
    expect(p.numbers).toEqual(['Shooter open 0.6 s', 'Defender needs 0.9 s'])
    expect(p.body).toContain('cannot get there in time')
    const c = explainMoment({ threatId: 'lift', openFor: 0.58, cause: 'deep-tag' }, coach)
    expect(c.headline).toBe('Deep low-man tag exposes the lift before the X-out arrives.')
  })
  it('formats seconds with 2 decimals below 1 s and 1 decimal from 1 s', () => {
    expect(formatSeconds(0.5)).toBe('0.5 s')
    expect(formatSeconds(0.999)).toBe('1.0 s')
    expect(formatSeconds(1)).toBe('1.0 s')
    expect(formatSeconds(1.26)).toBe('1.3 s')
    expect(explainMoment({ threatId: 'roll', openFor: 1.26 }, plain).numbers).toEqual(['Screener open 1.3 s'])
  })
  it('never invents numbers or conclusions', () => {
    const m = explainMoment({ threatId: 'corner', openFor: Number.NaN }, plain)
    expect(m.numbers).toEqual([])
    const n = explainMoment({ threatId: 'corner', openFor: 0.5 }, plain)
    expect(n.numbers).toEqual(['Shooter open 0.5 s'])
    expect(n.body).not.toContain('cannot get there')
  })
})

describe('describeTradeoff', () => {
  it('handles nothing, improvements, regressions and mixed', () => {
    expect(describeTradeoff([], plain)).toMatch(/Nothing important changed/)
    expect(describeTradeoff([{ threatId: 'lift', before: 0.5, after: 0.52 }], plain)).toMatch(
      /Nothing important changed/,
    )
    expect(describeTradeoff([{ threatId: 'lift', before: 0.5, after: 0 }], plain)).toMatch(
      /takes away .* does not open anything new/,
    )
    expect(describeTradeoff([{ threatId: 'roll', before: 0, after: 0.6 }], plain)).toMatch(
      /gives .* more room and does not take anything away/,
    )
    const mixed = describeTradeoff(
      [
        { threatId: 'lift', before: 0.5, after: 0 },
        { threatId: 'roll', before: 0, after: 0.6 },
      ],
      plain,
    )
    expect(mixed).toMatch(/protects .* but gives .* more room/)
    expect(
      describeTradeoff(
        [
          { threatId: 'lift', before: 0.5, after: 0 },
          { threatId: 'roll', before: 0, after: 0.6 },
        ],
        coach,
      ),
    ).toBe('Protects the lift but gives the roller more room; which window to concede is a philosophy call.')
  })
})
