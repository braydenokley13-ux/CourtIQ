/**
 * V3 P3 — Decoder explanation contract tests.
 *
 * Lock the four-decoder coverage and per-entry shape so a copy edit
 * can't silently drop a decoder or turn it into placeholder text.
 */

import { describe, expect, it } from 'vitest'

import { ALL_DECODER_TAGS } from '@/lib/pathways/types'
import {
  getAllDecoderExplanations,
  getDecoderExplanation,
  getDecoderOneLiner,
} from './explanations'

describe('decoder explanations', () => {
  it('covers every live decoder tag', () => {
    const tags = getAllDecoderExplanations().map((e) => e.tag).sort()
    const expected = [...ALL_DECODER_TAGS].sort()
    expect(tags).toEqual(expected)
  })

  it('returns a complete entry for every tag — no placeholder copy', () => {
    for (const tag of ALL_DECODER_TAGS) {
      const e = getDecoderExplanation(tag)
      expect(e.tag).toBe(tag)
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.oneLiner.length).toBeGreaterThan(0)
      expect(e.oneLiner.length).toBeLessThanOrEqual(64)
      expect(e.meaning.length).toBeGreaterThan(20)
      expect(e.watch.length).toBeGreaterThan(20)
      expect(e.matters.length).toBeGreaterThan(20)
      expect(e.example.length).toBeGreaterThan(20)
    }
  })

  it('one-liners stay distinct so chips never duplicate', () => {
    const liners = ALL_DECODER_TAGS.map((tag) => getDecoderOneLiner(tag))
    expect(new Set(liners).size).toBe(liners.length)
  })

  it('Backdoor Window explanation actually says "behind"', () => {
    const e = getDecoderExplanation('BACKDOOR_WINDOW')
    expect(e.meaning.toLowerCase()).toContain('behind')
  })

  it('Skip the Rotation explanation mentions cross-court / skip', () => {
    const e = getDecoderExplanation('SKIP_THE_ROTATION')
    const bag = `${e.meaning} ${e.watch}`.toLowerCase()
    expect(bag).toMatch(/cross[- ]court|skip/)
  })

  it('Advantage or Reset explanation references the closeout decision', () => {
    const e = getDecoderExplanation('ADVANTAGE_OR_RESET')
    const bag = `${e.meaning} ${e.watch}`.toLowerCase()
    expect(bag).toContain('closeout')
  })

  it('Empty-Space Cut explanation references helper / help defender', () => {
    const e = getDecoderExplanation('EMPTY_SPACE_CUT')
    const bag = `${e.meaning} ${e.watch}`.toLowerCase()
    expect(bag).toMatch(/help/)
  })
})
