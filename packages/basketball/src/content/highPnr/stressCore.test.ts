import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './scenario'
import { simulate } from '../../simulation/facade'
import { stress, stressSettings } from './stressCore'

describe('connected deterministic stress', () => {
  it('replays every installed counter under reproducible physical settings and pairs equal answers to zero', () => {
    const config = createDefaultConfig()
    config.assumptions.duration = 2
    const first = stress(config, config)
    const second = stress(config)
    expect(first.rows.map((row) => row.counter).sort()).toEqual([
      'extra',
      'lift',
      'pop',
      'reject',
      'roll',
      'short-roll',
      'skip',
      'slip',
    ])
    expect(first.settings).toEqual(second.settings)
    expect(
      first.rows.map((row) => row.outcomes.map((outcome) => [outcome.settingId, outcome.status, outcome.maxWindow])),
    ).toEqual(
      second.rows.map((row) => row.outcomes.map((outcome) => [outcome.settingId, outcome.status, outcome.maxWindow])),
    )
    expect(first.rows.every((row) => row.outcomes.every((outcome) => outcome.pairedDelta === 0))).toBe(true)
    expect(first.rows.every((row) => row.settingsCount === 7)).toBe(true)
    expect(first.rows.every((row) => row.status === 'thin')).toBe(true)
    expect(first.label).toContain('not success probabilities')
  }, 30000)

  it('changes actual defensive history when feet and read assumptions are varied', () => {
    const config = createDefaultConfig()
    config.assumptions.duration = 2
    const nominal = simulate(config)
    const feet = stressSettings(config).find((setting) => setting.id === 'feet-slower')!
    const read = stressSettings(config).find((setting) => setting.id === 'read-later')!
    const slower = simulate({ ...config, assumptions: { ...config.assumptions, ...feet.change } })
    const later = simulate({ ...config, assumptions: { ...config.assumptions, ...read.change } })
    const positions = (run: typeof nominal) =>
      run.frames[60].players
        .filter((player) => player.team === 'defense')
        .map((player) => [player.x, player.z, player.vx, player.vz])
    expect(positions(slower)).not.toEqual(positions(nominal))
    expect(positions(later)).not.toEqual(positions(nominal))
  })
})
