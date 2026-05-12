import { describe, expect, it } from 'vitest'

import {
  deriveJourneyState,
  JOURNEY_STEPS,
  type DecoderJourneyInput,
  type PathwayJourneyInput,
} from './journeyStep'

const PATHWAY = (over: Partial<PathwayJourneyInput> = {}): PathwayJourneyInput => ({
  pathwayProgress: 0,
  pathwayMastered: false,
  ...over,
})

const D = (over: Partial<DecoderJourneyInput> = {}): DecoderJourneyInput => ({
  state: 'in_progress',
  attempts: 4,
  ...over,
})

describe('deriveJourneyState', () => {
  it('cold-start lands on Learn', () => {
    const state = deriveJourneyState({
      attemptsCount: 0,
      decoders: [],
      pathway: null,
    })
    expect(state.current).toBe('learn')
    expect(state.status.learn).toBe('current')
    expect(state.status.train).toBe('next')
    // Kid-friendly cold-start framing: invite to watch / play.
    expect(state.headline.toLowerCase()).toMatch(/play|watch|read/)
  })

  it('first attempts move the player to Train', () => {
    const state = deriveJourneyState({
      attemptsCount: 3,
      decoders: [D()],
      pathway: PATHWAY({ pathwayProgress: 0.2 }),
    })
    expect(state.current).toBe('train')
    expect(state.status.learn).toBe('done')
    expect(state.status.train).toBe('current')
    expect(state.sub).toContain('20%')
  })

  it('one mastered decoder + halfway pathway moves to Test', () => {
    const state = deriveJourneyState({
      attemptsCount: 30,
      decoders: [D({ state: 'mastered' }), D()],
      pathway: PATHWAY({ pathwayProgress: 0.6 }),
    })
    expect(state.current).toBe('test')
    expect(state.status.train).toBe('done')
    expect(state.status.master).toBe('next')
  })

  it('pathway mastered lands on Master', () => {
    const state = deriveJourneyState({
      attemptsCount: 200,
      decoders: [D({ state: 'mastered' })],
      pathway: PATHWAY({ pathwayProgress: 1, pathwayMastered: true }),
    })
    expect(state.current).toBe('master')
    expect(state.status.test).toBe('done')
  })

  it('exports four journey steps in order', () => {
    expect(JOURNEY_STEPS.map((s) => s.id)).toEqual([
      'learn',
      'train',
      'test',
      'master',
    ])
  })
})
