import { describe, expect, it } from 'vitest'
import { isEnabled, type FeatureFlag } from './featureFlags'

const HUNT: FeatureFlag = 'hunt_decoder_v0_live'
const DROP: FeatureFlag = 'drop_decoder_v0_live'

describe('isEnabled', () => {
  it('returns false when FEATURE_FLAGS is unset', () => {
    expect(isEnabled(HUNT, {})).toBe(false)
    expect(isEnabled(DROP, {})).toBe(false)
  })

  it('returns false when FEATURE_FLAGS is empty', () => {
    expect(isEnabled(HUNT, { FEATURE_FLAGS: '' })).toBe(false)
  })

  it('returns true when a single matching flag is present', () => {
    expect(isEnabled(HUNT, { FEATURE_FLAGS: 'hunt_decoder_v0_live' })).toBe(true)
    expect(isEnabled(DROP, { FEATURE_FLAGS: 'hunt_decoder_v0_live' })).toBe(false)
  })

  it('returns true for each flag listed in a multi-flag CSV', () => {
    const env = { FEATURE_FLAGS: 'hunt_decoder_v0_live,drop_decoder_v0_live' }
    expect(isEnabled(HUNT, env)).toBe(true)
    expect(isEnabled(DROP, env)).toBe(true)
  })

  it('trims whitespace around CSV entries', () => {
    const env = { FEATURE_FLAGS: '  hunt_decoder_v0_live ,   drop_decoder_v0_live  ' }
    expect(isEnabled(HUNT, env)).toBe(true)
    expect(isEnabled(DROP, env)).toBe(true)
  })

  it('ignores unknown flag names in the CSV', () => {
    const env = { FEATURE_FLAGS: 'some_other_flag,hunt_decoder_v0_live,future_flag' }
    expect(isEnabled(HUNT, env)).toBe(true)
    expect(isEnabled(DROP, env)).toBe(false)
  })

  it('ignores empty CSV slots (trailing/duplicate commas)', () => {
    const env = { FEATURE_FLAGS: ',hunt_decoder_v0_live,,' }
    expect(isEnabled(HUNT, env)).toBe(true)
    expect(isEnabled(DROP, env)).toBe(false)
  })

  it('defaults to process.env when no env arg is provided', () => {
    const prev = process.env.FEATURE_FLAGS
    try {
      process.env.FEATURE_FLAGS = 'hunt_decoder_v0_live'
      expect(isEnabled(HUNT)).toBe(true)
      expect(isEnabled(DROP)).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.FEATURE_FLAGS
      else process.env.FEATURE_FLAGS = prev
    }
  })
})
