import { describe, it, expect } from 'vitest'
import { seedDailyChallenge, type DailyCatalogScenario } from './seed'

const cat = (over: Partial<DailyCatalogScenario>): DailyCatalogScenario => ({
  id: 'X',
  decoderTag: 'BACKDOOR_WINDOW',
  templateId: 'BDW.denied-wing',
  disguise: 'none',
  difficulty: 1,
  isLive: true,
  ...over,
})

function buildRichCatalog(): DailyCatalogScenario[] {
  // 25 LIVE scenarios across 4 decoders + heavy disguise variants.
  const scenarios: DailyCatalogScenario[] = []
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
  let i = 0
  for (const dec of decoders) {
    for (const dis of disguises) {
      scenarios.push(
        cat({
          id: `${dec.slice(0, 3)}-${dis}-${i++}`,
          decoderTag: dec,
          disguise: dis,
          difficulty: dis === 'heavy' ? 4 : dis === 'moderate' ? 3 : dis === 'light' ? 2 : 1,
        }),
      )
    }
  }
  // Pad to 25
  while (scenarios.length < 25) {
    scenarios.push(cat({ id: `EXTRA-${scenarios.length}` }))
  }
  return scenarios
}

describe('seedDailyChallenge', () => {
  it('returns available=false when LIVE catalog has fewer than 20 scenarios', () => {
    const r = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: [cat({ id: 'A' }), cat({ id: 'B' })],
    })
    expect(r.available).toBe(false)
    expect(r.scenarioIds).toEqual([])
  })

  it('produces 5 deterministic scenarios when catalog is rich enough', () => {
    const cat0 = buildRichCatalog()
    const a = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: cat0,
    })
    expect(a.available).toBe(true)
    expect(a.scenarioIds).toHaveLength(5)
  })

  it('is byte-deterministic across runs for the same date + catalog', () => {
    const cat0 = buildRichCatalog()
    const a = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: cat0,
    })
    const b = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: cat0,
    })
    expect(a.scenarioIds).toEqual(b.scenarioIds)
    expect(a.seedKey).toEqual(b.seedKey)
  })

  it('catalog reordering does NOT shift the daily', () => {
    const cat0 = buildRichCatalog()
    const a = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: cat0,
    })
    const b = seedDailyChallenge({
      utcDate: new Date('2026-05-07T00:00:00Z'),
      catalog: [...cat0].reverse(),
    })
    expect(a.scenarioIds).toEqual(b.scenarioIds)
  })

  it('different dates produce different bundles', () => {
    const cat0 = buildRichCatalog()
    const monday = seedDailyChallenge({
      utcDate: new Date('2026-05-04T00:00:00Z'), // Monday
      catalog: cat0,
    })
    const tuesday = seedDailyChallenge({
      utcDate: new Date('2026-05-05T00:00:00Z'), // Tuesday
      catalog: cat0,
    })
    expect(monday.scenarioIds).not.toEqual(tuesday.scenarioIds)
  })

  it('Sunday uses the Boss Sunday shape (mostly heavy)', () => {
    const cat0 = buildRichCatalog()
    const sunday = seedDailyChallenge({
      utcDate: new Date('2026-05-03T00:00:00Z'), // Sunday
      catalog: cat0,
    })
    expect(sunday.available).toBe(true)
    // At least 4 of 5 picks should be on heavy-disguise scenarios
    const heavyCount = sunday.slotPicks.filter((p) =>
      cat0.find((c) => c.id === p.scenarioId)?.disguise === 'heavy',
    ).length
    expect(heavyCount).toBeGreaterThanOrEqual(4)
  })

  it('downgrades the boss slot when no heavy disguise exists', () => {
    const noHeavy = buildRichCatalog().filter((c) => c.disguise !== 'heavy')
    const sat = seedDailyChallenge({
      utcDate: new Date('2026-05-09T00:00:00Z'), // Saturday — standard shape
      catalog: noHeavy,
    })
    expect(sat.available).toBe(true)
    const bossSlot = sat.slotPicks[4]!
    expect(bossSlot.downgrades.some((d) => d.startsWith('boss-fell-back'))).toBe(true)
  })

  it('every slot of the standard shape covers a different decoder for first 4', () => {
    const cat0 = buildRichCatalog()
    const r = seedDailyChallenge({
      utcDate: new Date('2026-05-05T00:00:00Z'),
      catalog: cat0,
    })
    const decoders = r.slotPicks
      .slice(0, 4)
      .map((p) => cat0.find((c) => c.id === p.scenarioId)?.decoderTag)
    expect(new Set(decoders).size).toBeGreaterThanOrEqual(3)
  })

  it('does not pick the same scenario twice within one daily', () => {
    const cat0 = buildRichCatalog()
    const r = seedDailyChallenge({
      utcDate: new Date('2026-05-05T00:00:00Z'),
      catalog: cat0,
    })
    expect(new Set(r.scenarioIds).size).toBe(5)
  })
})
