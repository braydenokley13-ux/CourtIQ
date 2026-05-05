/**
 * FR-7 — Pathways → film-room mapping contract tests.
 *
 * The plan's §13.7 table is the source of truth between Pathways and
 * the renderer. These tests pin every row of that table and the
 * specific success criteria called out in FR-7:
 *   - Boss Challenge → zero hints.
 *   - Final Mix (mixed-reads) → limited / no assist.
 *   - /train default unchanged.
 *   - Renderer remains decoupled from Pathways (architectural lock).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PathwayTrainingMode } from '@/lib/pathways/types'
import {
  FILM_ROOM_DEFAULT,
  FILM_ROOM_MODE_TABLE,
  isFilmRoomBossMode,
  pickFilmRoomMode,
  suppressesDecoderPill,
} from './filmRoomMode'
import { DEFAULT_OVERLAY_LEVEL } from './overlayLevel'

const ALL_MODES: readonly PathwayTrainingMode[] = [
  'learn-the-cue',
  'freeze-frame-read',
  'no-hint',
  'mixed-reads',
  'boss-challenge',
  'film-room',
  'pressure-test',
] as const

describe('FR-7 — pickFilmRoomMode honors the §13.7 contract table', () => {
  it('boss-challenge → zero hints (overlay none, camera none)', () => {
    expect(pickFilmRoomMode('boss-challenge')).toEqual({
      overlayLevel: 'none',
      cameraAssist: 'none',
    })
  })

  it('mixed-reads (Final Mix) → limited overlay / no camera assist', () => {
    expect(pickFilmRoomMode('mixed-reads')).toEqual({
      overlayLevel: 'intermediate',
      cameraAssist: 'none',
    })
  })

  it('learn-the-cue → full hint set (beginner / full)', () => {
    expect(pickFilmRoomMode('learn-the-cue')).toEqual({
      overlayLevel: 'beginner',
      cameraAssist: 'full',
    })
  })

  it('freeze-frame-read (early skill node) → beginner / partial', () => {
    expect(pickFilmRoomMode('freeze-frame-read')).toEqual({
      overlayLevel: 'beginner',
      cameraAssist: 'partial',
    })
  })

  it('no-hint (late skill node) → advanced overlay / partial camera', () => {
    expect(pickFilmRoomMode('no-hint')).toEqual({
      overlayLevel: 'advanced',
      cameraAssist: 'partial',
    })
  })

  it('film-room (Film Room Review) → review (uncapped) / full camera', () => {
    expect(pickFilmRoomMode('film-room')).toEqual({
      overlayLevel: 'review',
      cameraAssist: 'full',
    })
  })

  it('pressure-test → advanced overlay / no camera assist', () => {
    expect(pickFilmRoomMode('pressure-test')).toEqual({
      overlayLevel: 'advanced',
      cameraAssist: 'none',
    })
  })

  it('null / undefined trainingMode → /train default', () => {
    expect(pickFilmRoomMode(null)).toEqual(FILM_ROOM_DEFAULT)
    expect(pickFilmRoomMode(undefined)).toEqual(FILM_ROOM_DEFAULT)
  })

  it('FILM_ROOM_DEFAULT keeps /train unchanged — matches the canvas defaults', () => {
    // The canvas's own `cameraAssist = 'partial'` and overlay default
    // (`DEFAULT_OVERLAY_LEVEL`) are the pre-FR-7 behaviour. The
    // mapping helper must reflect the same defaults so callers passing
    // a null `trainingMode` get the legacy /train experience.
    expect(FILM_ROOM_DEFAULT.cameraAssist).toBe('partial')
    expect(FILM_ROOM_DEFAULT.overlayLevel).toBe(DEFAULT_OVERLAY_LEVEL)
  })

  it('returns the default for unknown strings rather than throwing (forward-compat)', () => {
    // Future Pathways modes / misconfiguration should never break the
    // renderer. The function must yield the safe default.
    const result = pickFilmRoomMode(
      'totally-new-mode' as unknown as PathwayTrainingMode,
    )
    expect(result).toEqual(FILM_ROOM_DEFAULT)
  })

  it('every PathwayTrainingMode union member has a mapping', () => {
    for (const mode of ALL_MODES) {
      const row = FILM_ROOM_MODE_TABLE[mode]
      expect(row).toBeDefined()
      expect(row.overlayLevel).toBeDefined()
      expect(row.cameraAssist).toBeDefined()
    }
  })

  it('table is frozen — Pathways/renderer cannot mutate the contract at runtime', () => {
    expect(Object.isFrozen(FILM_ROOM_MODE_TABLE)).toBe(true)
    // Mutation attempts in strict mode throw; in sloppy mode they
    // silently no-op. We assert post-state.
    try {
      ;(FILM_ROOM_MODE_TABLE as Record<string, unknown>)['boss-challenge'] = {
        overlayLevel: 'beginner',
        cameraAssist: 'full',
      }
    } catch {
      /* expected in strict mode */
    }
    expect(FILM_ROOM_MODE_TABLE['boss-challenge']).toEqual({
      overlayLevel: 'none',
      cameraAssist: 'none',
    })
  })
})

describe('FR-7 — predicate helpers', () => {
  it('isFilmRoomBossMode is true only for boss-challenge', () => {
    expect(isFilmRoomBossMode('boss-challenge')).toBe(true)
    expect(isFilmRoomBossMode('mixed-reads')).toBe(false)
    expect(isFilmRoomBossMode('learn-the-cue')).toBe(false)
    expect(isFilmRoomBossMode(null)).toBe(false)
    expect(isFilmRoomBossMode(undefined)).toBe(false)
  })

  it('suppressesDecoderPill matches the §13.7 "decoder pill: No" column', () => {
    // "No" rows: Boss Challenge, Mixed-Read Final.
    expect(suppressesDecoderPill('boss-challenge')).toBe(true)
    expect(suppressesDecoderPill('mixed-reads')).toBe(true)
    // "Yes" rows: Decoder Lesson, Skill Node (early/mid), Film Room
    // Review.
    expect(suppressesDecoderPill('learn-the-cue')).toBe(false)
    expect(suppressesDecoderPill('freeze-frame-read')).toBe(false)
    expect(suppressesDecoderPill('no-hint')).toBe(false)
    expect(suppressesDecoderPill('film-room')).toBe(false)
    expect(suppressesDecoderPill('pressure-test')).toBe(false)
    expect(suppressesDecoderPill(null)).toBe(false)
  })
})

describe('FR-7 — architectural lock: renderer stays decoupled from Pathways', () => {
  const SOURCE = readFileSync(join(__dirname, 'filmRoomMode.ts'), 'utf-8')

  it('filmRoomMode imports zero scenario3d component modules', () => {
    // Pure data + types only. The mapping is exercised by the canvas
    // / view layer; this file MUST NOT pull a THREE.js or React
    // dependency into the renderer's policy seam.
    expect(SOURCE).not.toMatch(/from '@\/components\/scenario3d/)
    expect(SOURCE).not.toMatch(/from 'three'/)
    expect(SOURCE).not.toMatch(/from 'react'/)
    expect(SOURCE).not.toMatch(/from '@react-three/)
  })

  it('filmRoomMode imports zero pathways services — only the type', () => {
    // The plan's §13.11 architectural lock: the renderer reads the
    // mode through a prop. The only allowed pathways import is the
    // `PathwayTrainingMode` type alias for exhaustiveness.
    const pathwaysImports = SOURCE.match(/from '@\/lib\/pathways[^']*'/g) ?? []
    expect(pathwaysImports).toHaveLength(1)
    expect(pathwaysImports[0]).toBe("from '@/lib/pathways/types'")
    // Type-only import (the symbol must be `import type`).
    expect(SOURCE).toMatch(
      /import type \{[^}]*PathwayTrainingMode[^}]*\} from '@\/lib\/pathways\/types'/,
    )
  })
})

describe('FR-7 — every mapping row produces a valid renderer config', () => {
  // Defense in depth: any future reshape of the table that adds an
  // invalid OverlayLevel / CameraAssist value gets caught here.
  const VALID_OVERLAY_LEVELS = new Set([
    'beginner',
    'intermediate',
    'advanced',
    'none',
    'review',
  ])
  const VALID_CAMERA_ASSIST = new Set(['full', 'partial', 'none'])

  for (const mode of ALL_MODES) {
    it(`${mode} maps to a valid renderer config`, () => {
      const row = FILM_ROOM_MODE_TABLE[mode]
      expect(VALID_OVERLAY_LEVELS.has(row.overlayLevel)).toBe(true)
      expect(VALID_CAMERA_ASSIST.has(row.cameraAssist)).toBe(true)
    })
  }
})

describe('FR-7 — boss-challenge invariants', () => {
  it('boss-challenge is the ONLY mode with overlayLevel="none"', () => {
    const noneOverlayModes = ALL_MODES.filter(
      (m) => FILM_ROOM_MODE_TABLE[m].overlayLevel === 'none',
    )
    expect(noneOverlayModes).toEqual(['boss-challenge'])
  })

  it('boss-challenge is the ONLY mode with both overlayLevel="none" AND cameraAssist="none"', () => {
    const fullySuppressed = ALL_MODES.filter((m) => {
      const row = FILM_ROOM_MODE_TABLE[m]
      return row.overlayLevel === 'none' && row.cameraAssist === 'none'
    })
    expect(fullySuppressed).toEqual(['boss-challenge'])
  })
})
