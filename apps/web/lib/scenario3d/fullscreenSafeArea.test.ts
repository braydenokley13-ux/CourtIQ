/**
 * V2-E — fullscreen chrome inset tests.
 *
 * Locks the policy:
 *  1. Non-fullscreen returns the legacy compact insets (12/12/12)
 *     unless an interaction overlay is requested, in which case the
 *     interaction inset bumps so the choice row never overlaps the
 *     transport pill.
 *  2. Bad / zero / negative dimensions fall back to a finite
 *     descriptor — the helper never returns NaN.
 *  3. Wider canvases get larger side insets — chips never kiss the
 *     ultrawide bezel.
 *  4. Portrait phone gets the largest top inset (notch / dynamic
 *     island clearance).
 *  5. Interaction max width caps narrower on phones than on desktop
 *     so a row of choice cards is always digestible.
 *  6. pxToSafeAreaCss generates a valid env() expression and never
 *     emits a negative pixel value.
 */

import { describe, it, expect } from 'vitest'
import {
  pxToSafeAreaCss,
  resolveFullscreenChromeInsets,
} from './fullscreenSafeArea'

describe('resolveFullscreenChromeInsets', () => {
  it('returns the legacy compact insets when not fullscreen', () => {
    const insets = resolveFullscreenChromeInsets({
      isFullscreen: false,
      widthPx: 800,
      heightPx: 450,
      hasInteractionOverlay: false,
    })
    expect(insets.cornerSideInsetPx).toBe(12)
    expect(insets.cornerTopInsetPx).toBe(12)
    expect(insets.transportBottomInsetPx).toBe(12)
  })

  it('bumps the interaction inset when an overlay is requested in normal mode', () => {
    const without = resolveFullscreenChromeInsets({
      isFullscreen: false,
      widthPx: 800,
      heightPx: 450,
      hasInteractionOverlay: false,
    })
    const withOverlay = resolveFullscreenChromeInsets({
      isFullscreen: false,
      widthPx: 800,
      heightPx: 450,
      hasInteractionOverlay: true,
    })
    expect(withOverlay.interactionBottomInsetPx).toBeGreaterThan(
      without.interactionBottomInsetPx,
    )
  })

  it('falls back to a finite descriptor when dimensions are bogus', () => {
    const insets = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 0,
      heightPx: 0,
      hasInteractionOverlay: false,
    })
    expect(Number.isFinite(insets.cornerSideInsetPx)).toBe(true)
    expect(Number.isFinite(insets.cornerTopInsetPx)).toBe(true)
    expect(Number.isFinite(insets.transportBottomInsetPx)).toBe(true)
    expect(insets.cornerSideInsetPx).toBeGreaterThan(0)
  })

  it('gives ultrawide canvases larger side insets than 16:9', () => {
    const desktop = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 1920,
      heightPx: 1080,
      hasInteractionOverlay: false,
    })
    const ultrawide = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 3440,
      heightPx: 1440,
      hasInteractionOverlay: false,
    })
    expect(ultrawide.cornerSideInsetPx).toBeGreaterThan(desktop.cornerSideInsetPx)
  })

  it('gives portrait phone the largest top inset', () => {
    const portrait = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 393,
      heightPx: 852,
      hasInteractionOverlay: false,
    })
    const desktop = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 1920,
      heightPx: 1080,
      hasInteractionOverlay: false,
    })
    expect(portrait.cornerTopInsetPx).toBeGreaterThan(desktop.cornerTopInsetPx)
  })

  it('caps the interaction overlay narrower on phones', () => {
    const portrait = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 393,
      heightPx: 852,
      hasInteractionOverlay: true,
    })
    const desktop = resolveFullscreenChromeInsets({
      isFullscreen: true,
      widthPx: 1920,
      heightPx: 1080,
      hasInteractionOverlay: true,
    })
    expect(portrait.interactionMaxWidthPx).toBeLessThan(desktop.interactionMaxWidthPx)
  })

  it('keeps every inset non-negative for every supported aspect', () => {
    const aspects: Array<[number, number]> = [
      [393, 852],
      [800, 600],
      [844, 390],
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
      [3440, 1440],
    ]
    for (const [w, h] of aspects) {
      const insets = resolveFullscreenChromeInsets({
        isFullscreen: true,
        widthPx: w,
        heightPx: h,
        hasInteractionOverlay: false,
      })
      expect(insets.cornerSideInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.cornerTopInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.transportBottomInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.interactionBottomInsetPx).toBeGreaterThanOrEqual(0)
      expect(insets.interactionMaxWidthPx).toBeGreaterThan(0)
    }
  })

  it('keeps the interaction inset above the transport inset', () => {
    const aspects: Array<[number, number]> = [
      [393, 852],
      [844, 390],
      [1280, 720],
      [1920, 1080],
      [3440, 1440],
    ]
    for (const [w, h] of aspects) {
      const insets = resolveFullscreenChromeInsets({
        isFullscreen: true,
        widthPx: w,
        heightPx: h,
        hasInteractionOverlay: true,
      })
      expect(insets.interactionBottomInsetPx).toBeGreaterThan(
        insets.transportBottomInsetPx,
      )
    }
  })
})

describe('pxToSafeAreaCss', () => {
  it('emits a valid calc(env(...)) string', () => {
    expect(pxToSafeAreaCss(24, 'top')).toMatch(/^calc\(env\(safe-area-inset-top, 0px\) \+ 24px\)$/)
    expect(pxToSafeAreaCss(38, 'bottom')).toMatch(/safe-area-inset-bottom/)
  })

  it('clamps negative pixel values to 0', () => {
    expect(pxToSafeAreaCss(-12, 'top')).toContain('+ 0px')
  })

  it('coerces non-finite input to 0', () => {
    expect(pxToSafeAreaCss(Number.NaN, 'top')).toContain('+ 0px')
    expect(pxToSafeAreaCss(Number.POSITIVE_INFINITY, 'top')).toContain('+ 0px')
  })
})
