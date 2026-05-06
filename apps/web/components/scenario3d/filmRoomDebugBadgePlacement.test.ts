/* @vitest-environment jsdom */
/**
 * V1 UX completion — FilmRoomDebugBadge placement contract.
 *
 * The badge previously hard-anchored to `right-2 top-2` which
 * collided with PremiumOverlay's top-right cluster (camera
 * selector, paths toggle, fullscreen button). The V1 UX pass moved
 * it to `bottom-2 right-2` so it sits clear of:
 *   - the top-right camera/paths/fullscreen cluster (PremiumOverlay)
 *   - the bottom-left GlbDebugBadge (which can be on at the same time)
 *   - the bottom-center transport pill
 *
 * It also added a click-to-expand toggle so the badge is a small
 * "FR-DEBUG" pill by default rather than a 6-row block sitting on
 * top of the canvas.
 *
 * These tests are structural regressions over the source so a
 * future refactor cannot quietly slide the badge back over the
 * camera cluster. We do NOT mount the React component (the badge
 * pulls in the renderer's imperative-scene module which expects
 * THREE.js / WebGL); a string-based source check is enough to pin
 * the contract.
 */

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BADGE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, 'FilmRoomDebugBadge.tsx'),
  'utf8',
)

describe('FilmRoomDebugBadge placement', () => {
  it('anchors to bottom-right (not top-right) by default so it never overlaps the camera cluster', () => {
    // Default (non-fullscreen) classes must include the bottom-right anchor.
    expect(BADGE_SOURCE).toMatch(/bottom-2 right-2 max-w-\[44%\]/)
    // Pre-V1 it used `top-2` on the OUTER wrapper.
    expect(BADGE_SOURCE).not.toMatch(/data-film-room-debug-badge="1"[\s\S]{0,200}\btop-2(?!\d)/)
  })

  it('repositions to top-left in fullscreen so it never crosses the choice overlay or transport pill', () => {
    // V1 Premiumization — when the canvas is fullscreen the badge
    // moves to top-3 left-3 and tightens its max-width so it never
    // crosses either the bottom-anchored choice overlay or the
    // bottom-center transport pill.
    expect(BADGE_SOURCE).toMatch(/top-3 left-3 max-w-\[40%\]/)
  })

  it('passes isFullscreen through the prop boundary', () => {
    expect(BADGE_SOURCE).toMatch(/isFullscreen\?:\s*boolean/)
    expect(BADGE_SOURCE).toMatch(/data-fullscreen-position=\{isFullscreen \? '1' : undefined\}/)
  })

  it('exposes a collapse toggle so the badge defaults to a compact pill', () => {
    // Toggle button must exist — `aria-expanded` + an `onClick`
    // setter for the expanded state.
    expect(BADGE_SOURCE).toMatch(/aria-expanded=\{expanded\}/)
    expect(BADGE_SOURCE).toMatch(/setExpanded\(\(v\) => !v\)/)
    // Collapsed default: useState<boolean>(false).
    expect(BADGE_SOURCE).toMatch(/useState<boolean>\(false\)/)
  })

  it('persists expand state across refreshes via sessionStorage', () => {
    expect(BADGE_SOURCE).toMatch(/courtiq\.filmRoomDebugBadge\.expanded/)
  })
})
