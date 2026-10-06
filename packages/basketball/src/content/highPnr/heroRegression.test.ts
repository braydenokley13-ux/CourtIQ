import { describe, expect, it } from 'vitest'
import { analyze } from '../../queries/analytics'
import { simulate } from '../../simulation/facade'
import { createDefaultConfig } from './scenario'

describe('preserved hero diagnostic behavior', () => {
  it('does not invent concurrent recovery deadlines when the handler keeps a rejected screen', () => {
    const config = createDefaultConfig()
    config.counter = 'reject'
    const result = simulate(config)
    expect(result.decisions.filter((d) => d.selected !== 'hold').map((d) => d.selected)).toEqual(['drive'])
    expect(result.events.some((event) => event.type === 'shot')).toBe(true)
    expect(
      result.frames.some(
        (frame) =>
          frame.responsibilities.filter((task) => task.defenderId === 'D4' && task.kind === 'split').length === 2,
      ),
    ).toBe(true)
    const analysis = analyze(result)
    expect(analysis.conflicts).toEqual([])
    expect(analysis.classification).toBe('holds')
  })
})
