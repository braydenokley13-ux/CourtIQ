/**
 * FR-8 Packet 1 — audit-table lock tests.
 *
 * Pin the GLB athlete audit constants so a future packet that drifts
 * from the audited values (rig height, region palette, material
 * params, clip count, intent count) fails fast and forces the change
 * to be acknowledged in this module.
 */

import { describe, expect, it } from 'vitest'

import {
  GLB_ATHLETE_AUDITED_INTENTS,
  GLB_ATHLETE_CLIP_NAMES,
  GLB_ATHLETE_IMPORTED_CLIP_NAMES,
  GLB_ATHLETE_MATERIAL_PARAMS,
  GLB_ATHLETE_REGION_PALETTE,
  GLB_FALLBACK_LADDER_ORDER,
  GLB_RIG_SOURCE_HEIGHT_M,
  GLB_RIG_TARGET_HEIGHT_FT,
  PLAYER_HEIGHT_DELTA_BUDGET_FT,
  PROCEDURAL_FIGURE_HEIGHT_FT,
} from './glbAthleteAudit'
import { ALL_ANIMATION_INTENTS } from './animationIntent'

describe('FR-8 Packet 1 — rig dimensional audit', () => {
  it('source rig height pinned to the Quaternius UAL2 mannequin export', () => {
    expect(GLB_RIG_SOURCE_HEIGHT_M).toBeCloseTo(1.808, 3)
  })

  it('post-scale GLB rig height matches the procedural figure within budget', () => {
    const delta = Math.abs(GLB_RIG_TARGET_HEIGHT_FT - PROCEDURAL_FIGURE_HEIGHT_FT)
    expect(delta).toBeLessThanOrEqual(PLAYER_HEIGHT_DELTA_BUDGET_FT)
  })

  it('m → ft scale multiplied by source height lands on the audited target', () => {
    const FT_PER_M = 1 / 0.3048
    const scaled = GLB_RIG_SOURCE_HEIGHT_M * FT_PER_M
    expect(scaled).toBeCloseTo(GLB_RIG_TARGET_HEIGHT_FT, 1)
  })

  it('procedural figure height stays at 5.95 ft', () => {
    expect(PROCEDURAL_FIGURE_HEIGHT_FT).toBe(5.95)
  })

  it('player-height delta budget pinned at ±0.05 ft', () => {
    expect(PLAYER_HEIGHT_DELTA_BUDGET_FT).toBe(0.05)
  })
})

describe('FR-8 Packet 1 — region palette is frozen', () => {
  it('palette covers shorts/skin/shoes/hair — every non-jersey region has a colour', () => {
    expect(Object.keys(GLB_ATHLETE_REGION_PALETTE).sort()).toEqual([
      'hair',
      'shoes',
      'shorts',
      'skin',
    ])
  })

  it('every palette colour is a 6-digit hex string', () => {
    for (const [, hex] of Object.entries(GLB_ATHLETE_REGION_PALETTE)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('palette object is frozen — runtime mutation is impossible', () => {
    expect(Object.isFrozen(GLB_ATHLETE_REGION_PALETTE)).toBe(true)
  })

  it('jersey colour is NOT in the palette — driven per-team by the caller', () => {
    expect((GLB_ATHLETE_REGION_PALETTE as Record<string, string>).jersey).toBeUndefined()
  })
})

describe('FR-8 Packet 1 — material params (roughness / metalness)', () => {
  it('body material is matte cloth-style (roughness in [0.6, 0.85], low metalness)', () => {
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyRoughness).toBeGreaterThanOrEqual(0.6)
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyRoughness).toBeLessThanOrEqual(0.85)
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyMetalness).toBeGreaterThanOrEqual(0)
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyMetalness).toBeLessThanOrEqual(0.06)
  })

  it('joints overlay is non-metallic so it disappears into the silhouette', () => {
    expect(GLB_ATHLETE_MATERIAL_PARAMS.jointsMetalness).toBe(0)
  })

  it('material params object is frozen', () => {
    expect(Object.isFrozen(GLB_ATHLETE_MATERIAL_PARAMS)).toBe(true)
  })
})

describe('FR-8 Packet 1 — clip library coverage', () => {
  it('audited GLB clip count is 6 (idle + 5 retargeted)', () => {
    expect(GLB_ATHLETE_CLIP_NAMES).toHaveLength(6)
  })

  it('every audited clip name is unique', () => {
    expect(new Set(GLB_ATHLETE_CLIP_NAMES).size).toBe(GLB_ATHLETE_CLIP_NAMES.length)
  })

  it('imported clip set is exactly closeout + back_cut', () => {
    expect([...GLB_ATHLETE_IMPORTED_CLIP_NAMES].sort()).toEqual([
      'back_cut',
      'closeout',
    ])
  })

  it('audit clip names include the four readability primitives the resolver references', () => {
    // P2.6 + FR-8 readability primitives the resolver routes intents to.
    for (const name of [
      'idle_ready',
      'receive_ready',
      'closeout_read',
      'defensive_deny',
    ]) {
      expect(GLB_ATHLETE_CLIP_NAMES).toContain(name)
    }
  })
})

describe('FR-8 Packet 1 — intent vocabulary lock', () => {
  it('audited intent set matches ALL_ANIMATION_INTENTS exactly', () => {
    expect([...GLB_ATHLETE_AUDITED_INTENTS].sort()).toEqual(
      [...ALL_ANIMATION_INTENTS].sort(),
    )
  })

  it('audit lists exactly 12 intents — locked by the v1 vocabulary contract', () => {
    expect(GLB_ATHLETE_AUDITED_INTENTS).toHaveLength(12)
  })
})

describe('FR-8 Packet 1 — fallback ladder is the §6.1 sequence', () => {
  it('ladder is 5 tiers in plan order', () => {
    expect(GLB_FALLBACK_LADDER_ORDER).toEqual([
      'glb-with-clip',
      'glb-with-idle',
      'procedural',
      'two-d',
      'magenta-proxy',
    ])
  })

  it('GLB-with-clip is always tier 0', () => {
    expect(GLB_FALLBACK_LADDER_ORDER[0]).toBe('glb-with-clip')
  })

  it('magenta-proxy is the last tier — dev-only and never reached in production', () => {
    expect(GLB_FALLBACK_LADDER_ORDER[GLB_FALLBACK_LADDER_ORDER.length - 1]).toBe(
      'magenta-proxy',
    )
  })
})
