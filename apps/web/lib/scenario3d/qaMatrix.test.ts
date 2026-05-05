/**
 * FR-1 Packet 8 — QA matrix data-integrity test.
 *
 * Asserts every founder-v0 id appears exactly once in the matrix,
 * every entry references a valid decoder tag, and every entry has
 * the cluster-cap-respecting overlay set the planning doc requires.
 * Any future drift between scenario seeds and the matrix lights up
 * here rather than as silent QA-page rot.
 */

import { describe, it, expect } from 'vitest'
import {
  QA_MATRIX,
  QA_MATRIX_IDS,
  getQaMatrixEntry,
  groupQaMatrixByDecoder,
} from './qaMatrix'
import type { DecoderTag } from './schema'

const FOUNDER_V0_IDS: readonly string[] = [
  'BDW-01',
  'BDW-02',
  'BDW-03',
  'BDW-04',
  'BDW-05',
  'ESC-01',
  'ESC-02',
  'ESC-03',
  'ESC-04',
  'ESC-05',
  'AOR-01',
  'AOR-02',
  'AOR-03',
  'AOR-04',
  'AOR-05',
  'SKR-01',
  'SKR-02',
  'SKR-03',
  'SKR-04',
  'SKR-05',
] as const

const DECODER_TAGS: readonly DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
] as const

describe('QA_MATRIX', () => {
  it('contains exactly twenty entries', () => {
    expect(QA_MATRIX).toHaveLength(20)
  })

  it('covers every founder-v0 scenario id exactly once', () => {
    const ids = QA_MATRIX.map((e) => e.id)
    expect(new Set(ids).size).toBe(QA_MATRIX.length)
    for (const expected of FOUNDER_V0_IDS) {
      expect(ids).toContain(expected)
    }
  })

  it('exposes the same ids via QA_MATRIX_IDS', () => {
    expect(QA_MATRIX_IDS).toHaveLength(20)
    expect([...QA_MATRIX_IDS].sort()).toEqual([...FOUNDER_V0_IDS].sort())
  })

  it('uses only valid decoder tags', () => {
    for (const e of QA_MATRIX) {
      expect(DECODER_TAGS).toContain(e.decoder)
    }
  })

  it('has five entries per decoder family', () => {
    const grouped = groupQaMatrixByDecoder()
    for (const tag of DECODER_TAGS) {
      const entries = grouped.get(tag)
      expect(entries, `entries for ${tag}`).toBeDefined()
      expect(entries!.length, `count for ${tag}`).toBe(5)
    }
  })

  it('every entry has at least one required overlay', () => {
    for (const e of QA_MATRIX) {
      expect(
        e.requiredOverlays.length,
        `requiredOverlays for ${e.id}`,
      ).toBeGreaterThan(0)
    }
  })

  it('every entry stays at or below the beginner cluster cap of 3', () => {
    for (const e of QA_MATRIX) {
      expect(
        e.requiredOverlays.length,
        `cluster cap for ${e.id}`,
      ).toBeLessThanOrEqual(3)
    }
  })

  it('every entry has non-empty primary cue, framing, highlight, and risk', () => {
    for (const e of QA_MATRIX) {
      expect(e.primaryCue, `primaryCue for ${e.id}`).not.toBe('')
      expect(e.requiredFraming, `requiredFraming for ${e.id}`).not.toBe('')
      expect(e.requiredHighlight, `requiredHighlight for ${e.id}`).not.toBe(
        '',
      )
      expect(e.knownRisk, `knownRisk for ${e.id}`).not.toBe('')
    }
  })

  it('every entry has a valid priority value', () => {
    for (const e of QA_MATRIX) {
      expect(['high', 'medium', 'low']).toContain(e.priority)
    }
  })

  it('encodes the family naming convention in id prefixes', () => {
    const familyPrefix: Record<DecoderTag, string> = {
      BACKDOOR_WINDOW: 'BDW',
      EMPTY_SPACE_CUT: 'ESC',
      ADVANTAGE_OR_RESET: 'AOR',
      SKIP_THE_ROTATION: 'SKR',
    }
    for (const e of QA_MATRIX) {
      expect(e.id.startsWith(`${familyPrefix[e.decoder]}-`)).toBe(true)
    }
  })

  it('getQaMatrixEntry resolves all founder-v0 ids and returns undefined otherwise', () => {
    for (const id of FOUNDER_V0_IDS) {
      const entry = getQaMatrixEntry(id)
      expect(entry, `entry for ${id}`).toBeDefined()
      expect(entry!.id).toBe(id)
    }
    expect(getQaMatrixEntry('XYZ-99')).toBeUndefined()
    expect(getQaMatrixEntry('')).toBeUndefined()
  })
})
