/* @vitest-environment jsdom */
/**
 * V1 UX completion — fullscreen interaction overlay contract.
 *
 * Locks the wiring that makes the choice UI usable inside fullscreen
 * (the V1 UX gap flagged in the stabilization report). The contract:
 *
 *   1. Scenario3DView declares a `renderFullscreenOverlay` render-prop
 *      AND an `onFullscreenChange` callback.
 *   2. The render-prop output is mounted INSIDE the fullscreen target
 *      wrapper (so it lives inside the browser's fullscreen viewport
 *      instead of the page-layout DOM that gets hidden).
 *   3. The slot only renders while `isFullscreen === true` so the
 *      page-layout copy keeps owning the in-page UI.
 *   4. /train passes a function that returns
 *      `<FullscreenChoicesOverlay ... />` and uses
 *      `onFullscreenChange` to hide its in-page choice stack while
 *      the overlay version is showing.
 *
 * Structural-source assertions; no React mount.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const VIEW_SRC = fs.readFileSync(
  path.resolve(__dirname, 'Scenario3DView.tsx'),
  'utf8',
)
const TRAIN_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../app/train/page.tsx'),
  'utf8',
)
const OVERLAY_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../app/train/FullscreenChoicesOverlay.tsx'),
  'utf8',
)

describe('Scenario3DView — fullscreen overlay contract', () => {
  it('declares the renderFullscreenOverlay render-prop and onFullscreenChange callback', () => {
    expect(VIEW_SRC).toMatch(
      /renderFullscreenOverlay\?:\s*\(state:\s*\{\s*isFullscreen:\s*boolean\s*\}\)\s*=>\s*ReactNode/,
    )
    expect(VIEW_SRC).toMatch(/onFullscreenChange\?:\s*\(isFullscreen:\s*boolean\)\s*=>\s*void/)
  })

  it('mounts the overlay slot inside the fullscreen target wrapper, gated on isFullscreen', () => {
    // Slot must be rendered as a child of the same container that
    // carries `data-fullscreen` (the fullscreen target). Our marker
    // attribute is `data-fullscreen-interaction-overlay`.
    expect(VIEW_SRC).toMatch(/data-fullscreen-interaction-overlay="1"/)
    // Gate: only render when isFullscreen is true.
    expect(VIEW_SRC).toMatch(
      /props\.renderFullscreenOverlay\s*&&\s*isFullscreen/,
    )
  })

  it('forwards isFullscreen state changes to the parent via onFullscreenChange', () => {
    expect(VIEW_SRC).toMatch(/onFullscreenChangeRef\.current\?\.\(next\)/)
  })

  it('overlay slot is bottom-anchored above the transport pill, not occluding the canvas centre', () => {
    // Required Tailwind classes for layout: absolute, bottom-0,
    // pointer-events-none on the wrapper (so canvas hover still
    // works in the empty zones), and pointer-events-auto on the
    // inner card (so users can still click choices).
    const slotMatch = VIEW_SRC.match(
      /data-fullscreen-interaction-overlay="1"[\s\S]*?<\/div>\s*\)\s*:\s*null/,
    )
    expect(slotMatch).not.toBeNull()
    const block = slotMatch![0]
    expect(block).toMatch(/\babsolute\b/)
    expect(block).toMatch(/\binset-x-0\b/)
    expect(block).toMatch(/\bbottom-0\b/)
    expect(block).toMatch(/\bpointer-events-none\b/)
    expect(block).toMatch(/\bpointer-events-auto\b/)
  })

  it('uses the shared fullscreen safe-area helper for overlay spacing', () => {
    expect(VIEW_SRC).toMatch(/resolveFullscreenChromeInsets/)
    expect(VIEW_SRC).toMatch(/pxToSafeAreaCss/)
    expect(VIEW_SRC).toMatch(/interactionBottomInsetPx/)
    expect(VIEW_SRC).toMatch(/interactionMaxWidthPx/)
  })
})

describe('/train — wires Scenario3DView to surface choices in fullscreen', () => {
  it('imports FullscreenChoicesOverlay and renders it via renderFullscreenOverlay', () => {
    expect(TRAIN_SRC).toMatch(/import\s*\{\s*FullscreenChoicesOverlay\s*\}\s*from\s*'\.\/FullscreenChoicesOverlay'/)
    expect(TRAIN_SRC).toMatch(
      /renderFullscreenOverlay=\{[\s\S]*?<FullscreenChoicesOverlay[\s\S]*?\/>/,
    )
  })

  it('hides the in-page choice stack when filmRoomFullscreen is true', () => {
    expect(TRAIN_SRC).toMatch(/setFilmRoomFullscreen\b/)
    // The in-page choices container uses `hidden={filmRoomFullscreen}`
    // so it disappears while the fullscreen overlay copy is showing.
    expect(TRAIN_SRC).toMatch(
      /<div className="space-y-2"\s+data-suppressed-by-fullscreen=\{filmRoomFullscreen \? '1' : undefined\}\s+hidden=\{filmRoomFullscreen\}>/,
    )
  })

  it('subscribes to onFullscreenChange to drive filmRoomFullscreen state', () => {
    expect(TRAIN_SRC).toMatch(/onFullscreenChange=\{setFilmRoomFullscreen\}/)
  })
})

describe('FullscreenChoicesOverlay — reuses ChoiceCard for visual parity', () => {
  it('imports ChoiceCard + deriveChoiceState from the page-level module', () => {
    expect(OVERLAY_SRC).toMatch(
      /import \{\s*ChoiceCard,\s*deriveChoiceState\s*\}\s*from\s*'\.\/ChoiceCard'/,
    )
  })

  it('renders nothing when the question is not yet ready (pre-freeze)', () => {
    expect(OVERLAY_SRC).toMatch(/if \(!questionReady\) return null/)
  })

  it('renders nothing when there are no choices', () => {
    expect(OVERLAY_SRC).toMatch(/if \(choices\.length === 0\) return null/)
  })

  it('uses a responsive grid that collapses to 1 column on the smallest viewports', () => {
    expect(OVERLAY_SRC).toMatch(/grid-cols-1\b/)
    expect(OVERLAY_SRC).toMatch(/sm:grid-cols-2\b/)
    expect(OVERLAY_SRC).toMatch(/lg:grid-cols-4\b/)
  })
})
