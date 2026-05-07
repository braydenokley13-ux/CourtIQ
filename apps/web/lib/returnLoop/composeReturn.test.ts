import { describe, it, expect } from 'vitest'
import {
  composeReturnSession,
  strongestDecoder,
  type ReturnCatalogScenario,
} from './composeReturn'
import type { DecoderConfidence } from '../adaptive/types'

const conf = (over: Partial<DecoderConfidence> = {}): DecoderConfidence => ({
  decoderTag: 'BACKDOOR_WINDOW',
  band: 'recognizing',
  evidence: {
    attempts: 6,
    accuracyLastN: 0.7,
    p50LatencyMs: 3500,
    transferTemplates: 1,
    hardestDisguiseRecognized: 'none',
    inadmissibleCount: 0,
  },
  nextProbe: 'maintain',
  ...over,
})

const cat = (over: Partial<ReturnCatalogScenario>): ReturnCatalogScenario => ({
  id: 'X',
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  difficulty: 1,
  isFresh: false,
  ...over,
})

describe('strongestDecoder', () => {
  it('returns null when nothing is in progress', () => {
    expect(strongestDecoder([conf({ band: 'untested' })])).toBeNull()
  })

  it('prefers reflexive over recognizing', () => {
    const recognizing = conf({ decoderTag: 'BACKDOOR_WINDOW', band: 'recognizing' })
    const reflexive = conf({ decoderTag: 'EMPTY_SPACE_CUT', band: 'reflexive' })
    expect(strongestDecoder([recognizing, reflexive])!.decoderTag).toBe('EMPTY_SPACE_CUT')
  })

  it('breaks ties on lower latency', () => {
    const slow = conf({
      decoderTag: 'BACKDOOR_WINDOW',
      band: 'recognizing',
      evidence: { ...conf().evidence, p50LatencyMs: 4500 },
    })
    const fast = conf({
      decoderTag: 'EMPTY_SPACE_CUT',
      band: 'recognizing',
      evidence: { ...conf().evidence, p50LatencyMs: 2900 },
    })
    expect(strongestDecoder([slow, fast])!.decoderTag).toBe('EMPTY_SPACE_CUT')
  })
})

describe('composeReturnSession', () => {
  const decoders = [
    conf({ decoderTag: 'BACKDOOR_WINDOW', band: 'recognizing' }),
    conf({ decoderTag: 'ADVANTAGE_OR_RESET', band: 'reflexive' }),
  ]

  const richCatalog: ReturnCatalogScenario[] = [
    cat({ id: 'BDW-T1-01' }),
    cat({ id: 'BDW-T1-02' }),
    cat({ id: 'BDW-T2-01', templateId: 'BDW.denied-slot' }),
    cat({
      id: 'AOR-T1-01',
      decoderTag: 'ADVANTAGE_OR_RESET',
      templateId: 'AOR.short-closeout-shoot',
    }),
    cat({
      id: 'AOR-T1-02',
      decoderTag: 'ADVANTAGE_OR_RESET',
      templateId: 'AOR.short-closeout-shoot',
    }),
    cat({
      id: 'AOR-T1-03',
      decoderTag: 'ADVANTAGE_OR_RESET',
      templateId: 'AOR.short-closeout-shoot',
    }),
    cat({
      id: 'AOR-T1-04',
      decoderTag: 'ADVANTAGE_OR_RESET',
      templateId: 'AOR.short-closeout-shoot',
    }),
    // Second AOR template for transfer to land on
    cat({
      id: 'AOR-T2-01',
      decoderTag: 'ADVANTAGE_OR_RESET',
      templateId: 'AOR.flying-closeout-drive',
    }),
    cat({ id: 'BDW-FRESH-01', isFresh: true }),
    cat({ id: 'BDW-FRESH-02', isFresh: true }),
  ]

  it('fresh-cold returns empty reps + a focusLine if any', () => {
    const r = composeReturnSession({
      context: 'fresh-cold',
      banner: null,
      decoders,
      catalog: richCatalog,
    })
    expect(r.reps).toHaveLength(0)
    // strongest decoder is AOR (reflexive)
    expect(r.focusLine).toContain('Advantage or Reset')
  })

  it('next-day produces 4 anchors + 1 transfer', () => {
    const r = composeReturnSession({
      context: 'next-day',
      banner: 'Picking up where you left off.',
      decoders,
      catalog: richCatalog,
    })
    expect(r.reps).toHaveLength(5)
    expect(r.reps.slice(0, 4).every((rp) => rp.slot === 'anchor')).toBe(true)
    expect(r.reps[4]!.slot).toBe('transfer')
    expect(r.banner).toBe('Picking up where you left off.')
  })

  it('within-week produces 2 anchors + 2 fresh + 1 transfer', () => {
    const r = composeReturnSession({
      context: 'within-week',
      banner: null,
      decoders,
      catalog: richCatalog,
    })
    expect(r.reps).toHaveLength(5)
    const slots = r.reps.map((rp) => rp.slot)
    expect(slots.filter((s) => s === 'anchor')).toHaveLength(2)
    expect(slots.filter((s) => s === 'fresh')).toHaveLength(2)
    expect(slots.filter((s) => s === 'transfer')).toHaveLength(1)
  })

  it('lapsed builds 3 strongest-anchors + 2 fresh', () => {
    const r = composeReturnSession({
      context: 'lapsed',
      banner: 'Welcome back.',
      decoders,
      catalog: richCatalog,
    })
    expect(r.reps).toHaveLength(5)
    expect(r.reps.filter((rp) => rp.slot === 'anchor-strongest')).toHaveLength(3)
    expect(r.reps.filter((rp) => rp.slot === 'fresh')).toHaveLength(2)
  })

  it('long-lapsed/dormant return empty reps + focusLine (caller defers to firstSession)', () => {
    for (const context of ['long-lapsed', 'dormant'] as const) {
      const r = composeReturnSession({
        context,
        banner: null,
        decoders,
        catalog: richCatalog,
      })
      expect(r.reps).toHaveLength(0)
      expect(r.focusLine).toBeTruthy()
    }
  })

  it('flags catalogIncomplete when fresh slot has no fresh content', () => {
    const noFresh = richCatalog.filter((c) => !c.isFresh)
    const r = composeReturnSession({
      context: 'within-week',
      banner: null,
      decoders,
      catalog: noFresh,
    })
    expect(r.catalogIncomplete).toBe(true)
    const freshSlots = r.reps.filter((rp) => rp.slot === 'fresh')
    expect(freshSlots.some((rp) => rp.downgrades.includes('no-fresh-match'))).toBe(true)
  })

  it('transfer slot picks a different template than the anchors used', () => {
    const r = composeReturnSession({
      context: 'next-day',
      banner: null,
      decoders,
      catalog: richCatalog,
    })
    const transfer = r.reps[4]!
    expect(transfer.slot).toBe('transfer')
    // The transfer scenario must be in the strongest decoder (AOR) AND
    // must not share its template with any prior rep.
    const transferId = transfer.scenarioId
    const transferScenario = richCatalog.find((c) => c.id === transferId)!
    const priorTpl = new Set(
      r.reps.slice(0, 4).map((rp) => richCatalog.find((c) => c.id === rp.scenarioId)?.templateId),
    )
    expect(transferScenario.decoderTag).toBe('ADVANTAGE_OR_RESET')
    expect(priorTpl.has(transferScenario.templateId)).toBe(false)
  })

  it('transfer slot announces the downgrade when no different-template candidate exists', () => {
    // Catalog has only one AOR template, so the transfer slot can't
    // honor its preference — must fall back AND announce.
    const onlyOneAorTemplate: ReturnCatalogScenario[] = [
      cat({ id: 'BDW-T1-01' }),
      cat({
        id: 'AOR-T1-01',
        decoderTag: 'ADVANTAGE_OR_RESET',
        templateId: 'AOR.short-closeout-shoot',
      }),
      cat({
        id: 'AOR-T1-02',
        decoderTag: 'ADVANTAGE_OR_RESET',
        templateId: 'AOR.short-closeout-shoot',
      }),
    ]
    const r = composeReturnSession({
      context: 'next-day',
      banner: null,
      decoders,
      catalog: onlyOneAorTemplate,
    })
    const transfer = r.reps[4]!
    expect(transfer.slot).toBe('transfer')
    expect(transfer.downgrades).toContain('no-transfer-match')
    expect(r.catalogIncomplete).toBe(true)
  })

  it('is deterministic (sorted catalog → same bundle)', () => {
    const a = composeReturnSession({
      context: 'next-day',
      banner: null,
      decoders,
      catalog: richCatalog,
    })
    const b = composeReturnSession({
      context: 'next-day',
      banner: null,
      decoders,
      catalog: [...richCatalog].reverse(),
    })
    expect(a.reps.map((r) => r.scenarioId)).toEqual(b.reps.map((r) => r.scenarioId))
  })
})
