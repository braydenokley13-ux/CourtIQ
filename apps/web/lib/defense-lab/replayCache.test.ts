import { beforeEach, describe, expect, it } from 'vitest'
import { clearReplayCache, REPLAY_CACHE_LIMITS, replayCacheStats, simulateCached } from './replayCache'
import { createDefaultConfig } from './scenario'

describe('bounded immutable UI replay cache', () => {
  beforeEach(clearReplayCache)

  it('reuses exact input without letting edits contaminate shared history', () => {
    const config = createDefaultConfig()
    const original = simulateCached(config)
    expect(simulateCached(structuredClone(config))).toBe(original)
    expect(Object.isFrozen(original.frames[0].players[0].pose)).toBe(true)
    expect(Object.isFrozen(original.frames[0].options[0].target)).toBe(true)
    expect(Object.isFrozen(original.config.answer)).toBe(true)
    config.answer.tagDepth = 0.25
    const edited = simulateCached(config)
    expect(edited).not.toBe(original)
    expect(original.config.answer.tagDepth).toBe(0.95)
    expect(replayCacheStats().hits).toBe(1)
  })

  it('includes timed movement, physics assumptions and adaptive intent in the key', () => {
    const config = createDefaultConfig(), baseline = simulateCached(config)
    expect(simulateCached({ ...config, assumptions: { ...config.assumptions, turnRate: 3 } })).not.toBe(baseline)
    expect(simulateCached({ ...config, interventions: [{ id: 'new-rule', kind: 'answer', at: 0.75, patch: { tagDepth: 0.25 } }] })).not.toBe(baseline)
    expect(simulateCached({ ...config, opponent: { ...config.opponent!, liftWidth: 0.35 } })).not.toBe(baseline)
  })

  it('evicts least-recently-used worlds and also enforces the aggregate frame bound', () => {
    const config = createDefaultConfig(), first = simulateCached(config)
    const second = simulateCached({ ...config, seed: 2027 }); simulateCached({ ...config, seed: 2028 })
    expect(simulateCached(config)).toBe(first)
    simulateCached({ ...config, seed: 2029 })
    const stats = replayCacheStats()
    expect(stats.entries).toBeLessThanOrEqual(REPLAY_CACHE_LIMITS.entries)
    expect(stats.retainedFrames).toBeLessThanOrEqual(REPLAY_CACHE_LIMITS.frames)
    expect(simulateCached({ ...config, seed: 2027 })).not.toBe(second)
    const large = { ...config, assumptions: { ...config.assumptions, duration: 10 } }
    simulateCached(large); simulateCached({ ...large, seed: 2030 })
    expect(replayCacheStats().entries).toBe(1)
    const long = { ...config, assumptions: { ...config.assumptions, duration: 12, dt: 0.01 } }
    const oversized = simulateCached(long)
    expect(simulateCached(long)).not.toBe(oversized)
    expect(replayCacheStats().retainedFrames).toBeLessThanOrEqual(REPLAY_CACHE_LIMITS.frames)
  })
})
