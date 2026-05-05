/**
 * FR-7 — /train wiring contract.
 *
 * The /train page is the production caller that turns a Pathways
 * training context into the renderer-level (overlayLevel, cameraAssist)
 * pair. Without the wiring, Boss Challenge URLs would still mount the
 * full beginner cluster — the renderer would be doing the right thing
 * but the train route would never tell it which mode to be in.
 *
 * These tests use source-level structural assertions (no DOM,
 * no React render) for the same reason the other scenario3d
 * structural tests do — the page is heavy with auth, supabase, and
 * Next router code that is impractical to mount in a unit-test env.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TRAIN_PAGE = readFileSync(
  join(__dirname, '..', '..', 'app', 'train', 'page.tsx'),
  'utf-8',
)

describe('FR-7 — /train forwards filmRoomMode to Scenario3DView', () => {
  it('imports the mapping helper from the renderer policy seam', () => {
    expect(TRAIN_PAGE).toMatch(
      /import \{[^}]*pickFilmRoomMode[^}]*\} from '@\/lib\/scenario3d\/filmRoomMode'/,
    )
  })

  it('derives filmRoomMode from the pathway context training mode', () => {
    expect(TRAIN_PAGE).toMatch(
      /pickFilmRoomMode\(\s*[\s\S]{0,400}?pathwayContext\?\.trainingMode/,
    )
  })

  it('memoises the mapping on trainingMode identity so scene swaps inside one chapter share a stable object', () => {
    // The mapping must live inside `useMemo([pathwayContext?.trainingMode])`
    // so chapter-internal navigations don't churn the canvas's effects
    // any more than absolutely necessary.
    expect(TRAIN_PAGE).toMatch(
      /useMemo\(\s*\(\) =>[\s\S]{0,400}?pickFilmRoomMode/,
    )
    // The deps array should pin `trainingMode`.
    expect(TRAIN_PAGE).toMatch(
      /useMemo\([^]+?\}[^]*?\[pathwayContext\?\.trainingMode\]/,
    )
  })

  it('passes BOTH overlayLevel and cameraAssist to Scenario3DView', () => {
    // Find the Scenario3DView block and assert both props appear.
    const scenarioViewIdx = TRAIN_PAGE.indexOf('<Scenario3DView')
    expect(scenarioViewIdx).toBeGreaterThan(0)
    const closeIdx = TRAIN_PAGE.indexOf('/>', scenarioViewIdx)
    expect(closeIdx).toBeGreaterThan(scenarioViewIdx)
    const block = TRAIN_PAGE.slice(scenarioViewIdx, closeIdx)
    expect(block).toMatch(/overlayLevel=\{filmRoomMode\.overlayLevel\}/)
    expect(block).toMatch(/cameraAssist=\{filmRoomMode\.cameraAssist\}/)
  })

  it('does NOT pass hard-coded overlayLevel/cameraAssist values — keeps Pathways as the source of truth', () => {
    // Lock the architectural seam: the page must read the values from
    // the mapping helper, not invent its own. A literal like
    // `overlayLevel="none"` or `cameraAssist="full"` here would mean
    // /train has its own mind about the contract — exactly what §13.7
    // forbids.
    expect(TRAIN_PAGE).not.toMatch(
      /<Scenario3DView[\s\S]{0,800}?overlayLevel=["']/,
    )
    expect(TRAIN_PAGE).not.toMatch(
      /<Scenario3DView[\s\S]{0,800}?cameraAssist=["']/,
    )
  })
})

describe('FR-7 — /train default flow stays unchanged when no pathway is active', () => {
  it('falls through pickFilmRoomMode(null) for the no-pathway case', () => {
    // The mapping call passes a nullable trainingMode — when the URL
    // has no `?pathway=`, this resolves to null and the helper
    // returns FILM_ROOM_DEFAULT. Lock the call shape.
    expect(TRAIN_PAGE).toMatch(
      /pickFilmRoomMode\([\s\S]{0,400}?pathwayContext\?\.trainingMode\s*\?\?\s*null[\s\S]{0,400}?\)/,
    )
  })
})
