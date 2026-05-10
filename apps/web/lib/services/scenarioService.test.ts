import type { DecoderTag } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { filterByFeatureFlags } from './scenarioService'

// Tag string literals match the Prisma enum members added by the
// Phase γ HUNT/DROP migration. They're typed loosely here so the
// test compiles regardless of which enum revision is current.
const HUNT = 'HUNT_THE_ADVANTAGE' as unknown as DecoderTag
const DROP = 'READ_THE_COVERAGE' as unknown as DecoderTag
const OTHER = 'BACKDOOR_WINDOW' as unknown as DecoderTag

interface MiniScenario {
  id: string
  decoder_tag: DecoderTag | null
}

const POOL: MiniScenario[] = [
  { id: 'hunt-1', decoder_tag: HUNT },
  { id: 'hunt-2', decoder_tag: HUNT },
  { id: 'drop-1', decoder_tag: DROP },
  { id: 'other-1', decoder_tag: OTHER },
  { id: 'untagged-1', decoder_tag: null },
]

describe('filterByFeatureFlags', () => {
  it('excludes both HUNT and DROP scenarios when neither flag is enabled', () => {
    const ids = filterByFeatureFlags(POOL, {}).map((s) => s.id).sort()
    expect(ids).toEqual(['other-1', 'untagged-1'])
  })

  it('admits HUNT scenarios when hunt_decoder_v0_live is enabled', () => {
    const env = { FEATURE_FLAGS: 'hunt_decoder_v0_live' }
    const ids = filterByFeatureFlags(POOL, env).map((s) => s.id).sort()
    expect(ids).toEqual(['hunt-1', 'hunt-2', 'other-1', 'untagged-1'])
  })

  it('admits DROP scenarios when drop_decoder_v0_live is enabled', () => {
    const env = { FEATURE_FLAGS: 'drop_decoder_v0_live' }
    const ids = filterByFeatureFlags(POOL, env).map((s) => s.id).sort()
    expect(ids).toEqual(['drop-1', 'other-1', 'untagged-1'])
  })

  it('admits both families when both flags are enabled', () => {
    const env = { FEATURE_FLAGS: 'hunt_decoder_v0_live,drop_decoder_v0_live' }
    const ids = filterByFeatureFlags(POOL, env).map((s) => s.id).sort()
    expect(ids).toEqual(['drop-1', 'hunt-1', 'hunt-2', 'other-1', 'untagged-1'])
  })

  it('does not touch untagged or non-gated decoder scenarios', () => {
    const env = {}
    const result = filterByFeatureFlags(POOL, env)
    expect(result.some((s) => s.id === 'other-1')).toBe(true)
    expect(result.some((s) => s.id === 'untagged-1')).toBe(true)
  })

  it('returns an empty array when given an empty pool', () => {
    expect(filterByFeatureFlags([], {})).toEqual([])
  })
})
