/**
 * /dev/scenario-preview pack reader — round-trip tests.
 *
 * Pack 2 §3.1.4 / §3.1.13 — the URL contract requires:
 *   - `?id=BDW-01`     → founder-v0 scenario.
 *   - `?id=BDW-T2-01`  → templates-v1 (gold-standard Pack 2) scenario.
 *   - `?scenario=…`    → back-compat alias (lower precedence; resolved by
 *                         the page wrapper, not by these helpers).
 *
 * The helpers run server-side, so the test reads the actual pack JSONs
 * via `process.cwd()`-relative path resolution. Vitest is invoked from
 * the apps/web package, which is exactly how the Next.js page resolves
 * its paths in production, so the resolution stays in lockstep with the
 * runtime.
 */

import { describe, expect, it } from 'vitest'
import {
  PREVIEW_PACK_DIRS,
  listAllPackIds,
  readScenario,
  resolveRequestedId,
} from './_packReader'

describe('_packReader.PREVIEW_PACK_DIRS', () => {
  it('lists founder-v0 and templates-v1 in resolution order', () => {
    expect(PREVIEW_PACK_DIRS).toEqual(['founder-v0', 'templates-v1'])
  })
})

describe('_packReader.listAllPackIds', () => {
  it('exposes every founder-v0 scenario id', async () => {
    const ids = await listAllPackIds()
    for (const required of ['BDW-01', 'ESC-01', 'AOR-01', 'SKR-01']) {
      expect(ids).toContain(required)
    }
  })

  it('exposes the gold-standard Pack 2 BDW-T2-01 alongside founder-v0', async () => {
    const ids = await listAllPackIds()
    expect(ids).toContain('BDW-T2-01')
  })
})

describe('_packReader.readScenario', () => {
  it('reads founder-v0 BDW-01', async () => {
    const r = await readScenario('BDW-01')
    expect(r).not.toBeNull()
    expect(r?.id).toBe('BDW-01')
    expect(r?.decoder_tag).toBe('BACKDOOR_WINDOW')
  })

  it('reads templates-v1 BDW-T2-01 (Pack 2 gold-standard)', async () => {
    const r = await readScenario('BDW-T2-01')
    expect(r).not.toBeNull()
    expect(r?.id).toBe('BDW-T2-01')
    expect(r?.decoder_tag).toBe('BACKDOOR_WINDOW')
    // Difficulty should be the variant's authored D3.
    expect(r?.difficulty).toBe(3)
    // sub_concepts carry the materializer's identity tags.
    expect(r?.sub_concepts).toContain('tpl:BDW.late-clock-corner-deny')
  })

  it('returns null for an unknown id', async () => {
    expect(await readScenario('DOES-NOT-EXIST-99')).toBeNull()
  })
})

describe('_packReader.resolveRequestedId', () => {
  const knownIds = ['BDW-01', 'BDW-02', 'BDW-T2-01']

  it('returns the requested id when it is known', () => {
    expect(
      resolveRequestedId({
        requested: 'BDW-T2-01',
        knownIds,
        defaultId: 'BDW-01',
      }),
    ).toBe('BDW-T2-01')
    expect(
      resolveRequestedId({
        requested: 'BDW-01',
        knownIds,
        defaultId: 'BDW-01',
      }),
    ).toBe('BDW-01')
  })

  it('falls back to the default when the requested id is unknown', () => {
    expect(
      resolveRequestedId({
        requested: 'BOGUS-99',
        knownIds,
        defaultId: 'BDW-01',
      }),
    ).toBe('BDW-01')
  })

  it('falls back to the default when no id is requested', () => {
    expect(
      resolveRequestedId({
        requested: null,
        knownIds,
        defaultId: 'BDW-01',
      }),
    ).toBe('BDW-01')
  })
})
