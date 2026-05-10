/**
 * FR-1 Packet 8 — QA matrix data-integrity test.
 *
 * Asserts every founder-v0 id appears exactly once in the matrix,
 * every entry references a valid decoder tag, and every entry has
 * the cluster-cap-respecting overlay set the planning doc requires.
 * Any future drift between scenario seeds and the matrix lights up
 * here rather than as silent QA-page rot.
 *
 * Pack 2 (Phase γ) — extended to cover the DROP and HUNT entries
 * added alongside the new pnr-coverage-v0 / hunt-decoder-v0 packs.
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

/** Pack 2 — additional decoder families shipped in phase β/γ. */
const PACK2_DECODER_TAGS: readonly DecoderTag[] = [
  'READ_THE_COVERAGE',
  'HUNT_THE_ADVANTAGE',
] as const

/** Pack 2 ids the matrix is expected to surface. */
const PACK2_IDS: readonly string[] = ['DROP-01', 'DROP-02', 'HUNT-01', 'HUNT-02'] as const

const EXPECTED_TOTAL = FOUNDER_V0_IDS.length + PACK2_IDS.length

describe('QA_MATRIX', () => {
  it('contains an entry for every shipped scenario (founder-v0 + Pack 2)', () => {
    expect(QA_MATRIX).toHaveLength(EXPECTED_TOTAL)
  })

  it('covers every founder-v0 scenario id exactly once', () => {
    const ids = QA_MATRIX.map((e) => e.id)
    expect(new Set(ids).size).toBe(QA_MATRIX.length)
    for (const expected of FOUNDER_V0_IDS) {
      expect(ids).toContain(expected)
    }
  })

  it('covers every Pack 2 scenario id exactly once', () => {
    const ids = QA_MATRIX.map((e) => e.id)
    for (const expected of PACK2_IDS) {
      expect(ids).toContain(expected)
    }
  })

  it('exposes the same ids via QA_MATRIX_IDS', () => {
    expect(QA_MATRIX_IDS).toHaveLength(EXPECTED_TOTAL)
    const expected = [...FOUNDER_V0_IDS, ...PACK2_IDS].sort()
    expect([...QA_MATRIX_IDS].sort()).toEqual(expected)
  })

  it('uses only valid decoder tags', () => {
    const all = [...DECODER_TAGS, ...PACK2_DECODER_TAGS]
    for (const e of QA_MATRIX) {
      expect(all).toContain(e.decoder)
    }
  })

  it('has five entries per founder-v0 decoder family', () => {
    const grouped = groupQaMatrixByDecoder()
    for (const tag of DECODER_TAGS) {
      const entries = grouped.get(tag)
      expect(entries, `entries for ${tag}`).toBeDefined()
      expect(entries!.length, `count for ${tag}`).toBe(5)
    }
  })

  it('has matching Pack 2 entry counts for the new DROP and HUNT families', () => {
    const grouped = groupQaMatrixByDecoder()
    expect(grouped.get('READ_THE_COVERAGE')?.length).toBe(2)
    expect(grouped.get('HUNT_THE_ADVANTAGE')?.length).toBe(2)
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
      // Pack 2. QA_MATRIX has no DROP/HUNT entries yet; these prefixes
      // are recorded so the convention check covers Pack 2 once entries
      // are added.
      READ_THE_COVERAGE: 'DROP',
      HUNT_THE_ADVANTAGE: 'HUNT',
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
