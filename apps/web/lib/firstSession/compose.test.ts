import { describe, it, expect } from 'vitest'
import { composeFirstSession, parseScenarioVariantTags, type CatalogScenario } from './compose'

const cat = (over: Partial<CatalogScenario>): CatalogScenario => ({
  id: 'X',
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  signature: 'orig|slot:cutter|d:1|disg:none|clk:none',
  disguise: 'none',
  mirror: false,
  difficulty: 1,
  ...over,
})

describe('parseScenarioVariantTags', () => {
  it('extracts template id and signature from sub_concepts', () => {
    const r = parseScenarioVariantTags([
      'cue:hand_in_lane',
      'tpl:BDW.denied-wing',
      'sig:mirror|slot:cutter|d:1|disg:light|clk:shot_clock',
    ])
    expect(r.templateId).toBe('BDW.denied-wing')
    expect(r.signature).toBe('mirror|slot:cutter|d:1|disg:light|clk:shot_clock')
    expect(r.disguise).toBe('light')
    expect(r.mirror).toBe(true)
  })

  it('defaults to disguise=none + mirror=false when sig is absent', () => {
    const r = parseScenarioVariantTags(['cue:foo'])
    expect(r.disguise).toBe('none')
    expect(r.mirror).toBe(false)
  })

  it('returns null template id for founder-v0 scenarios (no tpl: tag)', () => {
    const r = parseScenarioVariantTags(['off_ball_movement', 'reading_denial'])
    expect(r.templateId).toBe(null)
  })
})

describe('composeFirstSession', () => {
  it('returns 5 ordered steps when the catalog satisfies the script', () => {
    const catalog: CatalogScenario[] = [
      cat({ id: 'BDW-T1-01', disguise: 'moderate', mirror: false }),
      cat({ id: 'BDW-T1-02', disguise: 'none', mirror: true }),
      cat({ id: 'BDW-T2-01', templateId: 'BDW.denied-slot', mirror: false }),
      cat({
        id: 'AOR-T1-01',
        decoderTag: 'ADVANTAGE_OR_RESET',
        templateId: 'AOR.short-closeout-shoot',
        mirror: false,
      }),
      cat({ id: 'BDW-T1-05', disguise: 'light', difficulty: 2 }),
    ]
    const r = composeFirstSession(catalog)
    expect(r.steps).toHaveLength(5)
    expect(r.steps.map((s) => s.scenarioId)).toEqual([
      'BDW-T1-01',
      'BDW-T1-02',
      'BDW-T2-01',
      'AOR-T1-01',
      'BDW-T1-05',
    ])
    expect(r.catalogIncomplete).toBe(false)
  })

  it('rep 1 prefers disguise=moderate when available', () => {
    const catalog: CatalogScenario[] = [
      cat({ id: 'BDW-A', disguise: 'none' }),
      cat({ id: 'BDW-B', disguise: 'moderate' }),
    ]
    const r = composeFirstSession(catalog)
    expect(r.steps[0]!.scenarioId).toBe('BDW-B')
  })

  it('flags catalogIncomplete when AOR is missing for rep 4', () => {
    const catalog: CatalogScenario[] = [
      cat({ id: 'BDW-T1-01' }),
      cat({ id: 'BDW-T1-02', mirror: true }),
      cat({ id: 'BDW-T2-01', templateId: 'BDW.denied-slot' }),
      // no AOR available
      cat({ id: 'BDW-T1-05', disguise: 'light', difficulty: 2 }),
    ]
    const r = composeFirstSession(catalog)
    expect(r.steps).toHaveLength(5)
    expect(r.catalogIncomplete).toBe(true)
    // The downgrade should be reported on the step that needed AOR.
    expect(r.steps[3]!.downgrades).toContain('no-decoder-match')
  })

  it('falls back to reusing a scenario when the catalog is too thin', () => {
    const catalog: CatalogScenario[] = [cat({ id: 'BDW-ONLY' })]
    const r = composeFirstSession(catalog)
    expect(r.steps).toHaveLength(5)
    // First step picks it; later steps reuse and announce.
    const reuses = r.steps.slice(1).filter((s) => s.downgrades.includes('reused-from-earlier-rep'))
    expect(reuses.length).toBeGreaterThan(0)
  })

  it('returns empty steps when the catalog is completely empty', () => {
    const r = composeFirstSession([])
    expect(r.steps).toHaveLength(0)
    expect(r.catalogIncomplete).toBe(true)
  })

  it('rep 3 transfer probe prefers a different template than rep 2', () => {
    const catalog: CatalogScenario[] = [
      cat({ id: 'BDW-T1-01' }), // rep 1
      cat({ id: 'BDW-T1-02', mirror: true }), // rep 2 — same template as rep 1
      cat({ id: 'BDW-T1-03' }), // would match difficulty/decoder but same template
      cat({ id: 'BDW-T2-01', templateId: 'BDW.denied-slot' }), // different template
    ]
    const r = composeFirstSession(catalog)
    expect(r.steps[2]!.scenarioId).toBe('BDW-T2-01')
  })

  it('is deterministic — same catalog produces same steps run-over-run', () => {
    const catalog: CatalogScenario[] = [
      cat({ id: 'BDW-T1-01', disguise: 'moderate' }),
      cat({ id: 'BDW-T1-02', mirror: true }),
      cat({ id: 'BDW-T2-01', templateId: 'BDW.denied-slot' }),
      cat({
        id: 'AOR-T1-01',
        decoderTag: 'ADVANTAGE_OR_RESET',
        templateId: 'AOR.short-closeout-shoot',
      }),
      cat({ id: 'BDW-T1-05', disguise: 'light', difficulty: 2 }),
    ]
    const a = composeFirstSession(catalog).steps.map((s) => s.scenarioId)
    const b = composeFirstSession([...catalog].reverse()).steps.map((s) => s.scenarioId)
    expect(a).toEqual(b)
  })
})
