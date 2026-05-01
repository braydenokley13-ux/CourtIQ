import { describe, expect, it } from 'vitest'
import {
  buildGlbAthletePreview,
  GLB_ATHLETE_ASSET_URL,
  GLB_ATHLETE_USER_DATA_KEY,
  _resetGlbAthleteCache,
} from './glbAthlete'
import {
  USE_GLB_ATHLETE_PREVIEW,
  buildPlayerFigure,
  getPlayerIndicatorLayers,
} from './imperativeScene'

/**
 * Phase O-ASSET — GLB athlete preview path tests.
 *
 * The GLB asset itself cannot be loaded in the JSDOM test environment
 * because the Quaternius GLB ships as binary data behind the Next.js
 * public path; vitest does not run a server. These tests therefore
 * cover the contract pieces that DO matter for production safety:
 *
 *   1. The flag defaults to OFF.
 *   2. With the flag off, `buildPlayerFigure` returns the procedural
 *      figure (no GLB userData marker).
 *   3. The synchronous `buildGlbAthletePreview` returns `null` when
 *      the cache is empty (cold-load fallback path).
 *   4. The asset URL points at the bundled public-folder file.
 */

describe('Phase O-ASSET — flag default', () => {
  it('USE_GLB_ATHLETE_PREVIEW defaults to false', () => {
    expect(USE_GLB_ATHLETE_PREVIEW).toBe(false)
  })

  it('asset URL points at the bundled public-folder GLB', () => {
    expect(GLB_ATHLETE_ASSET_URL).toBe('/athlete/mannequin.glb')
  })
})

describe('Phase O-ASSET — fallback when cache empty', () => {
  it('buildGlbAthletePreview returns null when no asset is cached', () => {
    _resetGlbAthleteCache()
    const result = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    expect(result).toBeNull()
  })

  it('buildPlayerFigure returns a procedural figure with the flag off', () => {
    const figure = buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    expect(figure).toBeDefined()
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()
    const layers = getPlayerIndicatorLayers(figure)
    expect(layers).not.toBeNull()
  })
})
