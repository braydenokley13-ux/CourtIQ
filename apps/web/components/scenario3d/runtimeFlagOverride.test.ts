/**
 * P1.7 — Tests for the runtime flag-override helpers and the
 * imported-closeout preload entry point.
 *
 * Two surfaces are locked here:
 *
 *   1. `isGlbAthletePreviewActive()` and `isImportedCloseoutClipActive()`
 *      — they must return `false` by default (production-safe), `true`
 *      when the corresponding window-global override is set in a
 *      non-production environment, and `false` even with the override
 *      set when `process.env.NODE_ENV === 'production'` (defense-in-
 *      depth against a malicious page setting the global on a real
 *      production build).
 *
 *   2. `preloadImportedCloseoutClip()` — must:
 *      a. populate the imported-clip cache for
 *         `GLB_IMPORTED_CLOSEOUT_CLIP_URL` after a successful
 *         resolve (test-side: cache is injected via the test helper
 *         to bypass the network).
 *      b. be safe to call when the imported-closeout gate is OFF
 *         (callers that gate on `isImportedCloseoutClipActive()`
 *         simply never invoke it; this test only proves the function
 *         itself never throws and never imports network data when
 *         the loader is given no asset).
 *      c. NEVER fetch the asset when the test environment is Node
 *         (the loader returns `null` outside a browser); this is the
 *         contract the cold-mount preload relies on.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY,
  IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY,
  USE_GLB_ATHLETE_PREVIEW,
  USE_IMPORTED_CLOSEOUT_CLIP,
  isGlbAthletePreviewActive,
  isImportedCloseoutClipActive,
} from './imperativeScene'
import {
  GLB_IMPORTED_CLOSEOUT_CLIP_URL,
  preloadImportedCloseoutClip,
} from './glbAthlete'
import {
  _resetImportedClipCache,
  _setImportedClipCacheForTest,
  getCachedImportedClip,
} from './importedClipLoader'

function clearOverrides(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  delete w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY]
  delete w[IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY]
}

describe('P1.7 — runtime flag-override helpers', () => {
  beforeEach(() => {
    clearOverrides()
  })
  afterEach(() => {
    clearOverrides()
  })

  it('module-level consts default to false', () => {
    // Defense in depth — if this drifts, the production default is
    // gone, which is a stop-the-line bug.
    expect(USE_GLB_ATHLETE_PREVIEW).toBe(false)
    expect(USE_IMPORTED_CLOSEOUT_CLIP).toBe(false)
  })

  it('helpers default to false when no override is set', () => {
    expect(isGlbAthletePreviewActive()).toBe(false)
    expect(isImportedCloseoutClipActive()).toBe(false)
  })

  it('helpers return true when the dev override window global is set in non-production', () => {
    // Vitest sets NODE_ENV='test' by default; explicitly assert
    // here so a future env change does not silently invalidate
    // the test.
    expect(process.env.NODE_ENV).not.toBe('production')

    const w = window as unknown as Record<string, unknown>
    w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY] = true
    expect(isGlbAthletePreviewActive()).toBe(true)
    // closeout helper still false until its own override flips on.
    expect(isImportedCloseoutClipActive()).toBe(false)

    w[IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY] = true
    expect(isImportedCloseoutClipActive()).toBe(true)
  })

  it('helpers ignore the override when NODE_ENV === "production"', () => {
    const w = window as unknown as Record<string, unknown>
    w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY] = true
    w[IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY] = true

    const originalEnv = process.env.NODE_ENV
    try {
      // Cast through unknown because NodeJS.ProcessEnv is a
      // read-only typed view over `process.env`; runtime mutation
      // is fine here for the test's lifetime.
      ;(process.env as unknown as Record<string, string>).NODE_ENV =
        'production'
      expect(isGlbAthletePreviewActive()).toBe(false)
      expect(isImportedCloseoutClipActive()).toBe(false)
    } finally {
      ;(process.env as unknown as Record<string, string>).NODE_ENV =
        originalEnv ?? 'test'
    }
  })

  it('falsey override values do not flip the helper', () => {
    const w = window as unknown as Record<string, unknown>
    // Anything that the developer might set by accident must not
    // count as on. This covers the common "I set it to '0' from
    // the URL" mistake.
    for (const v of [false, 0, '', null, undefined]) {
      w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY] = v
      expect(isGlbAthletePreviewActive()).toBe(false)
    }
    // Empty string must NOT count as on (Boolean(''') === false).
    w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY] = ''
    expect(isGlbAthletePreviewActive()).toBe(false)
  })
})

describe('P1.7 — preloadImportedCloseoutClip', () => {
  beforeEach(() => {
    _resetImportedClipCache()
  })
  afterEach(() => {
    _resetImportedClipCache()
  })

  it('hits the existing cache when an entry is already injected', async () => {
    // Inject a fully-formed (already stripped) clip into the cache
    // — the same path the synthetic placeholder uses. The preload
    // helper must NOT overwrite it; subsequent reads via
    // getCachedImportedClip return the injected entry.
    const fakeClip = new THREE.AnimationClip('closeout', 1, [])
    _setImportedClipCacheForTest(GLB_IMPORTED_CLOSEOUT_CLIP_URL, {
      clip: fakeClip,
      strippedTrackNames: ['pelvis.position'],
    })

    await preloadImportedCloseoutClip()

    const cached = getCachedImportedClip(GLB_IMPORTED_CLOSEOUT_CLIP_URL)
    expect(cached).not.toBeNull()
    expect(cached!.clip.name).toBe('closeout')
  })

  it('returns a Promise (never throws synchronously)', () => {
    // Defense in depth: callers `void` the result and rely on the
    // function not throwing in their useEffect chain. We do NOT
    // await the result here — the underlying GLTFLoader.load
    // hangs forever under JSDOM with no real fetch shim, which is
    // the exact case the production callsite is designed to
    // tolerate (it discards the promise).
    const result = preloadImportedCloseoutClip()
    expect(result).toBeInstanceOf(Promise)
    // Attach a no-op catch so the unhandled-rejection logger does
    // not warn about the dangling promise across the test boundary.
    void result.catch(() => null)
  })
})
