import { describe, expect, it } from 'vitest'
import { COACHING_TEMPLATES, interpretCoaching } from './coaching'
import { defenseResponsibilities } from './defensivePolicy'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { simulate } from './simulation'
import type { WorldFrame } from './types'

describe('deterministic coaching authoring', () => {
  it('discloses the backside change required to send the low man back to his own corner', () => {
    const preview = interpretCoaching('Tag until the big recovers, then get back to the corner.')
    expect(preview.supported).toBe(true)
    expect(preview.patch).toEqual({ tag: true, recovery: 'roller-secured', backside: 'stay' })
    expect(preview.explanation).toMatch(/D3 returns to the corner/)
    expect(preview.explanation).toMatch(/D4 stays with the lift/)
    expect(preview.explanation).toMatch(/replacing the X-out/)
    expect(preview.explanation).toMatch(/after the ball leaves the handler/)
  })

  it('executes the own-corner rule without handing the corner to the backside defender', () => {
    const config = createDefaultConfig()
    const patch = interpretCoaching('Tag until the big recovers, then get back to the corner.').patch!
    const answer = { ...config.answer, ...patch }
    const initial = simulate(config).frames[0]
    const observed: WorldFrame = {
      ...initial,
      t: 2,
      players: initial.players.map(player => player.id === 'O5'
        ? { ...player, x: 0.75, z: 3.2, vz: -1 }
        : player.id === 'D5' ? { ...player, x: 0.75, z: 4, vz: 0 } : player),
      ball: { ...initial.ball, phase: 'pass', owner: null, receiver: 'O3' },
    }
    const original = defenseResponsibilities(observed, config.answer, HIGH_PNR_PROBLEM, config, 2)
    const edited = defenseResponsibilities(observed, answer, HIGH_PNR_PROBLEM, config, 2)
    expect(original.find(rule => rule.defenderId === 'D4')?.threatId).toBe('corner')
    expect(edited.filter(rule => rule.defenderId === 'D3').map(rule => [rule.threatId, rule.kind])).toEqual([['corner', 'recover']])
    expect(edited.filter(rule => rule.defenderId === 'D4').map(rule => [rule.threatId, rule.kind])).toEqual([['lift', 'guard']])

    const notRecovered = { ...observed, players: observed.players.map(player => player.id === 'D5' ? { ...player, x: 4 } : player) }
    expect(defenseResponsibilities(notRecovered, answer, HIGH_PNR_PROBLEM, config, 2).some(rule => rule.defenderId === 'D3' && rule.kind === 'tag')).toBe(true)
  })

  it('accepts formatting changes while rejecting inferred or compound instructions', () => {
    expect(interpretCoaching('  CHASE  over\n the screen!  ').patch).toEqual({ poa: 'over' })
    for (const unsupported of [
      '',
      'Chase over the screen and switch late.',
      'Do not chase over the screen.',
      'Tag until the big recovers.',
      'Show early, then recover on the pass.',
      'Chase over the screen..',
    ]) {
      const result = interpretCoaching(unsupported)
      expect(result.supported).toBe(false)
      expect(result.patch).toBeNull()
      expect(result.explanation).toContain('No rule was created')
    }
  })

  it('rejects tag templates under switch rather than previewing a rule the coverage suppresses', () => {
    const config = createDefaultConfig()
    config.answer.coverage = 'switch'
    const before = JSON.stringify(config)
    const baseline = simulate(config)
    expect(baseline.frames.some(frame => frame.responsibilities.some(rule => rule.kind === 'switch'))).toBe(true)
    expect(baseline.frames.some(frame => frame.responsibilities.some(rule => rule.defenderId === 'D3' && rule.kind === 'tag'))).toBe(false)

    for (const template of COACHING_TEMPLATES.filter(candidate => candidate.id !== 'chase-over')) {
      const preview = interpretCoaching(template.text, config.answer)
      expect(preview.supported).toBe(false)
      expect(preview.patch).toBeNull()
      expect(preview.explanation).toMatch(/Switch exchanges the screen defenders/)
      expect(preview.explanation).toMatch(/Choose another coverage/)
      const reviewed = simulate({ ...config, answer: preview.patch ? { ...config.answer, ...preview.patch } : config.answer })
      expect(reviewed.frames).toEqual(baseline.frames)
      expect(reviewed.events).toEqual(baseline.events)
    }
    expect(JSON.stringify(config)).toBe(before)
    expect(interpretCoaching('Chase over the screen.', config.answer).patch).toEqual({ poa: 'over' })
    expect(interpretCoaching(COACHING_TEMPLATES[0].text, { coverage: 'drop' }).supported).toBe(true)
  })

  it('makes all offered templates executable and returns isolated preview patches', () => {
    expect(new Set(COACHING_TEMPLATES.map(template => template.id)).size).toBe(COACHING_TEMPLATES.length)
    for (const template of COACHING_TEMPLATES) {
      const first = interpretCoaching(template.text)
      expect(first.supported).toBe(true)
      expect(first.patch).not.toBeNull()
      expect(first.explanation).not.toBe('')
      const second = interpretCoaching(template.text)
      first.patch!.bigDepth = 6
      expect(second.patch).not.toHaveProperty('bigDepth')
      expect(interpretCoaching(template.text)).toEqual(second)
    }
  })
})

 it('previews removing conflicting additional reads while keeping them for an on-ball cue', () => {
  const answer = { coverage:'drop' as const, coachRules:[{kind:'lift-rise' as const,rise:1,response:'x-out' as const}] }
  const tag = interpretCoaching('Tag until the big recovers, then get back to the corner.',answer)
  expect(tag.patch?.coachRules).toEqual([])
  expect(tag.explanation).toContain('removes your additional roller and lift reads')
  expect(interpretCoaching('Chase over the screen.',answer).patch).not.toHaveProperty('coachRules')
  expect(answer.coachRules).toHaveLength(1)
 })
