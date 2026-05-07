import { describe, it, expect } from 'vitest'
import { composeDailyChallenge } from './compose'
import type { DailyCatalogScenario } from './seed'
import type { DecoderConfidence } from '../adaptive/types'

const cat = (over: Partial<DailyCatalogScenario>): DailyCatalogScenario => ({
  id: 'X',
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  disguise: 'none',
  difficulty: 1,
  isLive: true,
  ...over,
})

const conf = (over: Partial<DecoderConfidence>): DecoderConfidence => ({
  decoderTag: 'BACKDOOR_WINDOW',
  band: 'recognizing',
  evidence: {
    attempts: 5,
    accuracyLastN: 0.8,
    p50LatencyMs: 3500,
    transferTemplates: 1,
    hardestDisguiseRecognized: 'none',
    inadmissibleCount: 0,
  },
  nextProbe: 'transfer-probe',
  ...over,
})

function richCatalog(): DailyCatalogScenario[] {
  const list: DailyCatalogScenario[] = []
  const decoders = [
    'BACKDOOR_WINDOW',
    'ADVANTAGE_OR_RESET',
    'EMPTY_SPACE_CUT',
    'SKIP_THE_ROTATION',
  ]
  const disguises: ('none' | 'light' | 'moderate' | 'heavy')[] = [
    'none',
    'light',
    'moderate',
    'heavy',
  ]
  for (const dec of decoders) {
    for (const dis of disguises) {
      // Two templates per decoder so transfer-probe swaps have somewhere to land.
      for (const tpl of ['T1', 'T2']) {
        list.push(
          cat({
            id: `${dec.slice(0, 3)}-${tpl}-${dis}`,
            decoderTag: dec,
            templateId: `${dec.slice(0, 3)}.${tpl}`,
            disguise: dis,
            difficulty: dis === 'heavy' ? 4 : dis === 'moderate' ? 3 : 1,
          }),
        )
      }
    }
  }
  return list
}

describe('composeDailyChallenge', () => {
  it('passes through the global seed when no decoder confidences provided', () => {
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: [],
    })
    expect(r.available).toBe(true)
    expect(r.scenarioIds).toEqual(r.globalScenarioIds)
    expect(r.swappedSlotIndex).toBeNull()
    expect(r.mysteryMode).toBe(true)
  })

  it('swaps a slot when memorization signal exists on a slot decoder', () => {
    const decoders = [
      conf({ decoderTag: 'BACKDOOR_WINDOW', evidence: { ...conf({}).evidence, transferTemplates: 1, attempts: 5 } }),
    ]
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: decoders,
    })
    expect(r.available).toBe(true)
    expect(r.swappedSlotIndex).not.toBeNull()
    // The swapped scenario must be on a different template from the global pick.
    const swappedIdx = r.swappedSlotIndex!
    expect(r.scenarioIds[swappedIdx]).not.toEqual(r.globalScenarioIds[swappedIdx])
  })

  it('does not swap when transferTemplates === 0 (player has not recognized any template yet)', () => {
    const decoders = [
      conf({
        decoderTag: 'BACKDOOR_WINDOW',
        evidence: { ...conf({}).evidence, transferTemplates: 0, attempts: 2 },
      }),
    ]
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: decoders,
    })
    expect(r.swappedSlotIndex).toBeNull()
  })

  it('does not swap when memorization decoder is not in today\'s slot decoders', () => {
    // Make BDW the memorization candidate, but the daily today happens
    // to land its BDW pick on a slot — so this test is most useful as a
    // contract: if no slot has the decoder, no swap. We engineer it by
    // flagging memorization on a fictitious decoder.
    const decoders = [
      conf({
        decoderTag: 'NOT_A_REAL_DECODER',
        evidence: { ...conf({}).evidence, transferTemplates: 1, attempts: 5 },
      }),
    ]
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: decoders,
    })
    expect(r.swappedSlotIndex).toBeNull()
  })

  it('preserves globalScenarioIds for the shareable result', () => {
    const decoders = [
      conf({ evidence: { ...conf({}).evidence, transferTemplates: 1, attempts: 5 } }),
    ]
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: decoders,
    })
    expect(r.globalScenarioIds).toHaveLength(5)
  })

  it('returns available=false when catalog is too thin', () => {
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: [cat({ id: 'A' }), cat({ id: 'B' })],
      decoderConfidences: [],
    })
    expect(r.available).toBe(false)
    expect(r.mysteryMode).toBe(true)
  })

  it('always sets mysteryMode to true', () => {
    const r = composeDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: richCatalog(),
      decoderConfidences: [],
    })
    expect(r.mysteryMode).toBe(true)
  })
})
