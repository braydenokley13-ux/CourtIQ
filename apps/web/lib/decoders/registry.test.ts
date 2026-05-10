/**
 * Tests for the central decoder registry. The registry is the single
 * source of truth the train page, recognition surface, academy,
 * pathways, daily-challenge composer, and dev preview all share — so
 * regressions here cascade. Cover the contract tightly:
 *
 *   - all six decoders are present, in canonical order
 *   - schema parity with the Prisma `DecoderTag` enum at runtime
 *   - label resolution for known + unknown + null inputs
 *   - type guard rejects non-string + unknown values
 */
import { describe, expect, it } from 'vitest'
import { DecoderTag as PrismaDecoderTag } from '@prisma/client'
import {
  ALL_KNOWN_DECODERS,
  DECODER_LABELS,
  FOUNDER_DECODERS,
  PACK_2_DECODERS,
  decoderLabel,
  isKnownDecoderTag,
  type DecoderTag,
} from './registry'

describe('decoder registry — taxonomy', () => {
  it('lists the four founder decoders in canonical order', () => {
    expect(FOUNDER_DECODERS).toEqual([
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'SKIP_THE_ROTATION',
      'ADVANTAGE_OR_RESET',
    ])
  })

  it('lists the two Pack 2 decoders in canonical order', () => {
    expect(PACK_2_DECODERS).toEqual([
      'READ_THE_COVERAGE',
      'HUNT_THE_ADVANTAGE',
    ])
  })

  it('concatenates founders then Pack 2 into ALL_KNOWN_DECODERS', () => {
    expect(ALL_KNOWN_DECODERS).toEqual([
      ...FOUNDER_DECODERS,
      ...PACK_2_DECODERS,
    ])
  })

  it('matches the Prisma DecoderTag enum at runtime', () => {
    // Sorted comparison so order drift in Prisma's generated enum
    // doesn't false-positive — order is owned by this module.
    expect([...ALL_KNOWN_DECODERS].sort()).toEqual(
      Object.values(PrismaDecoderTag).sort(),
    )
  })
})

describe('decoder registry — DECODER_LABELS', () => {
  it('provides a label for every known decoder', () => {
    for (const tag of ALL_KNOWN_DECODERS) {
      expect(DECODER_LABELS[tag]).toBeTruthy()
      expect(typeof DECODER_LABELS[tag]).toBe('string')
    }
  })

  it('uses canonical Title Case copy with no leading article', () => {
    expect(DECODER_LABELS.BACKDOOR_WINDOW).toBe('Backdoor Window')
    expect(DECODER_LABELS.EMPTY_SPACE_CUT).toBe('Empty-Space Cut')
    expect(DECODER_LABELS.SKIP_THE_ROTATION).toBe('Skip the Rotation')
    expect(DECODER_LABELS.ADVANTAGE_OR_RESET).toBe('Advantage or Reset')
    expect(DECODER_LABELS.READ_THE_COVERAGE).toBe('Read the Coverage')
    expect(DECODER_LABELS.HUNT_THE_ADVANTAGE).toBe('Hunt the Advantage')
  })

  it('never surfaces a raw SCREAMING_SNAKE identifier as the label', () => {
    for (const tag of ALL_KNOWN_DECODERS) {
      expect(DECODER_LABELS[tag]).not.toMatch(/_/)
      expect(DECODER_LABELS[tag]).not.toEqual(tag)
    }
  })
})

describe('decoderLabel()', () => {
  it('returns the canonical label for a known decoder', () => {
    expect(decoderLabel('BACKDOOR_WINDOW')).toBe('Backdoor Window')
    expect(decoderLabel('READ_THE_COVERAGE')).toBe('Read the Coverage')
    expect(decoderLabel('HUNT_THE_ADVANTAGE')).toBe('Hunt the Advantage')
  })

  it('returns "Unknown Decoder" for null / undefined / empty string', () => {
    expect(decoderLabel(null)).toBe('Unknown Decoder')
    expect(decoderLabel(undefined)).toBe('Unknown Decoder')
    expect(decoderLabel('')).toBe('Unknown Decoder')
  })

  it('humanizes an unknown SCREAMING_SNAKE value rather than echoing it raw', () => {
    expect(decoderLabel('SOME_FUTURE_DECODER')).toBe('Some Future Decoder')
    // Defensive: the helper must not return the input unchanged.
    expect(decoderLabel('FUTURE_TAG')).not.toBe('FUTURE_TAG')
  })

  it('treats a typed DecoderTag input the same as its string form', () => {
    const tag: DecoderTag = 'EMPTY_SPACE_CUT'
    expect(decoderLabel(tag)).toBe(DECODER_LABELS[tag])
  })
})

describe('isKnownDecoderTag()', () => {
  it('accepts every known decoder tag', () => {
    for (const tag of ALL_KNOWN_DECODERS) {
      expect(isKnownDecoderTag(tag)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isKnownDecoderTag('BDW')).toBe(false)
    expect(isKnownDecoderTag('backdoor_window')).toBe(false)
    expect(isKnownDecoderTag('SOME_FUTURE_DECODER')).toBe(false)
  })

  it('rejects non-string inputs (defensive against typed-as-unknown payloads)', () => {
    expect(isKnownDecoderTag(null)).toBe(false)
    expect(isKnownDecoderTag(undefined)).toBe(false)
    expect(isKnownDecoderTag(123)).toBe(false)
    expect(isKnownDecoderTag({})).toBe(false)
    expect(isKnownDecoderTag([])).toBe(false)
  })
})
