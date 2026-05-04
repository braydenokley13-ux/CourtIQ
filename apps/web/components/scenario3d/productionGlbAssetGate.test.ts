/**
 * P3.3A — production GLB asset gating tests.
 *
 * Locks two contracts so the production GLB rendering fix never
 * silently regresses:
 *
 *   1. **Asset URL resolution.** The GLB athlete + companion clip
 *      URLs must be absolute, root-anchored public-folder paths
 *      (`/athlete/...`). Relative paths break in production because
 *      Next.js serves the route under nested URLs (`/train/foo`)
 *      where a relative `athlete/...` resolves to `/train/athlete/...`
 *      and 404s. Asset URL drift is the highest-frequency cause of
 *      "GLBs don't show in prod"; locking it here makes the failure
 *      mode catchable in CI.
 *
 *   2. **Production env-var gate.** `isGlbAthletePreviewActive()`
 *      (and the closeout / back-cut companions) must return `true`
 *      when:
 *        - `NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW === '1'` (etc.)
 *      regardless of `NODE_ENV`. The window-global dev override
 *      stays prod-locked. This is the surface that lets prod opt
 *      into GLB rendering without flipping the source-level `false`
 *      defaults that `runtimeFlagOverride.test.ts` defends.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY,
  GLB_ATHLETE_PREVIEW_PROD_ENV_KEY,
  IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY,
  IMPORTED_BACK_CUT_PROD_ENV_KEY,
  IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY,
  IMPORTED_CLOSEOUT_PROD_ENV_KEY,
  isGlbAthletePreviewActive,
  isImportedBackCutClipActive,
  isImportedCloseoutClipActive,
} from './imperativeScene'
import {
  GLB_ATHLETE_ASSET_URL,
  GLB_IMPORTED_BACK_CUT_CLIP_URL,
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
} from './glbAthlete'

function clearOverrides(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  delete w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY]
  delete w[IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY]
  delete w[IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY]
}

function clearEnvFlags(): void {
  delete (process.env as Record<string, string | undefined>)[
    GLB_ATHLETE_PREVIEW_PROD_ENV_KEY
  ]
  delete (process.env as Record<string, string | undefined>)[
    IMPORTED_CLOSEOUT_PROD_ENV_KEY
  ]
  delete (process.env as Record<string, string | undefined>)[
    IMPORTED_BACK_CUT_PROD_ENV_KEY
  ]
}

describe('P3.3A — GLB asset URL resolution', () => {
  it('GLB athlete URL is absolute and rooted at /athlete/', () => {
    expect(GLB_ATHLETE_ASSET_URL.startsWith('/athlete/')).toBe(true)
    expect(GLB_ATHLETE_ASSET_URL.endsWith('.glb')).toBe(true)
    expect(GLB_ATHLETE_ASSET_URL).toBe('/athlete/mannequin.glb')
  })

  it('imported closeout clip URL is absolute and rooted at /athlete/clips/', () => {
    expect(GLB_IMPORTED_CLOSEOUT_CLIP_URL.startsWith('/athlete/clips/')).toBe(
      true,
    )
    expect(GLB_IMPORTED_CLOSEOUT_CLIP_URL.endsWith('.glb')).toBe(true)
    expect(GLB_IMPORTED_CLOSEOUT_CLIP_URL).toBe('/athlete/clips/closeout.glb')
  })

  it('imported back-cut clip URL is absolute and rooted at /athlete/clips/', () => {
    expect(GLB_IMPORTED_BACK_CUT_CLIP_URL.startsWith('/athlete/clips/')).toBe(
      true,
    )
    expect(GLB_IMPORTED_BACK_CUT_CLIP_URL.endsWith('.glb')).toBe(true)
    expect(GLB_IMPORTED_BACK_CUT_CLIP_URL).toBe('/athlete/clips/back_cut.glb')
  })

  it('no GLB asset URL contains a `..` traversal or a leading `./`', () => {
    for (const url of [
      GLB_ATHLETE_ASSET_URL,
      GLB_IMPORTED_BACK_CUT_CLIP_URL,
      GLB_IMPORTED_CLOSEOUT_CLIP_URL,
    ]) {
      expect(url.includes('..')).toBe(false)
      expect(url.startsWith('./')).toBe(false)
      // Absolute URL is the only shape Next.js / Vercel serve from
      // the public folder reliably under nested route URLs.
      expect(url.startsWith('/')).toBe(true)
    }
  })
})

describe('P3.3A — env var prod-opt-in keys are stable', () => {
  it('exports the canonical NEXT_PUBLIC_* names', () => {
    // Pin the names — `next.config.ts` and the prod Vercel env must
    // match exactly. Drift here makes the prod opt-in silently a
    // no-op.
    expect(GLB_ATHLETE_PREVIEW_PROD_ENV_KEY).toBe(
      'NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW',
    )
    expect(IMPORTED_CLOSEOUT_PROD_ENV_KEY).toBe(
      'NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP',
    )
    expect(IMPORTED_BACK_CUT_PROD_ENV_KEY).toBe(
      'NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP',
    )
  })
})

describe('P3.3A — env var prod-opt-in flips the runtime gates', () => {
  beforeEach(() => {
    clearOverrides()
    clearEnvFlags()
  })
  afterEach(() => {
    clearOverrides()
    clearEnvFlags()
  })

  it('GLB athlete gate flips on when env var is "1", off otherwise', () => {
    expect(isGlbAthletePreviewActive()).toBe(false)
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    expect(isGlbAthletePreviewActive()).toBe(true)
    // Companion gates do not flip — each env var is independent.
    expect(isImportedCloseoutClipActive()).toBe(false)
    expect(isImportedBackCutClipActive()).toBe(false)
  })

  it('closeout gate flips on when its env var is "1"', () => {
    expect(isImportedCloseoutClipActive()).toBe(false)
    process.env[IMPORTED_CLOSEOUT_PROD_ENV_KEY] = '1'
    expect(isImportedCloseoutClipActive()).toBe(true)
    expect(isImportedBackCutClipActive()).toBe(false)
  })

  it('back-cut gate flips on when its env var is "1"', () => {
    expect(isImportedBackCutClipActive()).toBe(false)
    process.env[IMPORTED_BACK_CUT_PROD_ENV_KEY] = '1'
    expect(isImportedBackCutClipActive()).toBe(true)
    expect(isImportedCloseoutClipActive()).toBe(false)
  })

  it('prod env-var gate works even when NODE_ENV === "production"', () => {
    // The window-global dev override is intentionally short-circuited
    // in production; the env-var gate must NOT be — otherwise prod
    // can never opt in.
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    process.env[IMPORTED_CLOSEOUT_PROD_ENV_KEY] = '1'
    process.env[IMPORTED_BACK_CUT_PROD_ENV_KEY] = '1'

    const originalEnv = process.env.NODE_ENV
    try {
      ;(process.env as unknown as Record<string, string>).NODE_ENV =
        'production'
      expect(isGlbAthletePreviewActive()).toBe(true)
      expect(isImportedCloseoutClipActive()).toBe(true)
      expect(isImportedBackCutClipActive()).toBe(true)
    } finally {
      ;(process.env as unknown as Record<string, string>).NODE_ENV =
        originalEnv ?? 'test'
    }
  })

  it('only the literal string "1" enables the gate', () => {
    // Common typos / truthy strings ("true", "yes", "ON") must NOT
    // count. The contract is the literal `'1'`, matching the env-
    // var convention used throughout the prod deploy.
    for (const v of ['', '0', 'true', 'yes', 'on', 'false', ' 1 ']) {
      process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = v
      expect(isGlbAthletePreviewActive()).toBe(false)
    }
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    expect(isGlbAthletePreviewActive()).toBe(true)
  })
})

describe('P3.3A — public folder bundles the GLB assets', () => {
  it('lists the canonical asset filenames at the URLs the runtime requests', () => {
    // Mirror of `apps/web/public/athlete/...`. If a future packet
    // renames an asset on disk without updating this test, the prod
    // opt-in points at a 404. The integration tests in
    // `closeoutAssetIntegration.test.ts` /
    // `backCutAssetIntegration.test.ts` parse the actual bytes; this
    // test is the lighter-weight URL/path lock.
    expect(GLB_ATHLETE_ASSET_URL).toBe('/athlete/mannequin.glb')
    expect(GLB_IMPORTED_CLOSEOUT_CLIP_URL).toBe(
      '/athlete/clips/closeout.glb',
    )
    expect(GLB_IMPORTED_BACK_CUT_CLIP_URL).toBe(
      '/athlete/clips/back_cut.glb',
    )
  })
})
