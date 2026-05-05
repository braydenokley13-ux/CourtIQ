/**
 * FR-8 Packet 6 — procedural / GLB parity contract.
 *
 * The §7.6 plan goal: "GLB and procedural figures feel like the
 * same visual system." This test enforces parity at the seams the
 * audit module owns:
 *
 *   - both paths render with the same body material params
 *     (roughness / metalness)
 *   - both paths stand within the §7.8 height-delta budget
 *   - both paths apply a basketball-ready knee bend (the GLB pulls
 *     it from the canonical rest delta; the procedural authors its
 *     own, pinned by source-level inspection so a future
 *     refactor can't silently drop it)
 *
 * Tests are source-level + audit-data-level so they don't need to
 * mount THREE.js. The skinnedAthlete and imperativeScene modules
 * import the audit constants — that import is the contract.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  GLB_ATHLETE_MATERIAL_PARAMS,
  GLB_RIG_TARGET_HEIGHT_FT,
  PLAYER_HEIGHT_DELTA_BUDGET_FT,
  PROCEDURAL_FIGURE_HEIGHT_FT,
} from './glbAthleteAudit'

const SKINNED_PATH = join(
  __dirname,
  '..',
  '..',
  'components',
  'scenario3d',
  'skinnedAthlete.ts',
)
const GLB_PATH = join(
  __dirname,
  '..',
  '..',
  'components',
  'scenario3d',
  'glbAthlete.ts',
)
const SKINNED_SOURCE = readFileSync(SKINNED_PATH, 'utf-8')
const GLB_SOURCE = readFileSync(GLB_PATH, 'utf-8')

describe('FR-8 Packet 6 — material parity', () => {
  it('skinnedAthlete imports GLB_ATHLETE_MATERIAL_PARAMS from the audit module', () => {
    expect(SKINNED_SOURCE).toMatch(
      /import \{[^}]*GLB_ATHLETE_MATERIAL_PARAMS[^}]*\} from '@\/lib\/scenario3d\/glbAthleteAudit'/,
    )
  })

  it('skinnedAthlete uses the audited bodyRoughness / bodyMetalness for the skinned mesh material', () => {
    expect(SKINNED_SOURCE).toMatch(
      /roughness:\s*GLB_ATHLETE_MATERIAL_PARAMS\.bodyRoughness/,
    )
    expect(SKINNED_SOURCE).toMatch(
      /metalness:\s*GLB_ATHLETE_MATERIAL_PARAMS\.bodyMetalness/,
    )
  })

  it('glbAthlete imports the same audit material params', () => {
    expect(GLB_SOURCE).toMatch(
      /import \{[^}]*GLB_ATHLETE_MATERIAL_PARAMS[^}]*\} from '@\/lib\/scenario3d\/glbAthleteAudit'/,
    )
  })

  it('glbAthlete routes every multi-region material through the audit constants', () => {
    // Pre-FR-8 every MeshStandardMaterial in glbAthlete had its own
    // hard-coded roughness/metalness. After Packet 2 they all read
    // from the audit. A future packet that adds a NEW material call
    // site without going through the audit table will fail this.
    const numericRoughnessLiterals =
      GLB_SOURCE.match(/roughness:\s*0\.\d+/g) ?? []
    const auditedRoughnessRefs =
      GLB_SOURCE.match(/roughness:\s*GLB_ATHLETE_MATERIAL_PARAMS\./g) ?? []
    expect(auditedRoughnessRefs.length).toBeGreaterThanOrEqual(3)
    // Allow zero numeric literals — every roughness must read from
    // the audit table.
    expect(numericRoughnessLiterals).toHaveLength(0)
  })

  it('audited body params are matte cloth-style — match the §7.6 "feels like fabric" goal', () => {
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyRoughness).toBeGreaterThanOrEqual(0.6)
    expect(GLB_ATHLETE_MATERIAL_PARAMS.bodyMetalness).toBeLessThanOrEqual(0.06)
  })
})

describe('FR-8 Packet 6 — height parity', () => {
  it('GLB rig and procedural figure stand within the §7.8 ±0.05 ft budget', () => {
    const delta = Math.abs(GLB_RIG_TARGET_HEIGHT_FT - PROCEDURAL_FIGURE_HEIGHT_FT)
    expect(delta).toBeLessThanOrEqual(PLAYER_HEIGHT_DELTA_BUDGET_FT)
  })

  it('procedural figure stays at 5.95 ft so the §7.8 contract holds', () => {
    expect(PROCEDURAL_FIGURE_HEIGHT_FT).toBe(5.95)
  })
})

describe('FR-8 Packet 6 — stance parity (knee bend)', () => {
  it('skinnedAthlete idle clip authors a forward thigh delta — keeps the procedural athletic stance', () => {
    // Pre-FR-8 the procedural skinned figure already authored
    // -0.05 rad knee bend on each thigh. We pin that here as
    // regression-bait: a future refactor that drops the knee
    // delta would leave the procedural fallback collapsing to a
    // stiff-leg silhouette.
    expect(SKINNED_SOURCE).toMatch(
      /leftThigh\.name[\s\S]{0,300}eulerQuat\(-0\.05/,
    )
    expect(SKINNED_SOURCE).toMatch(
      /rightThigh\.name[\s\S]{0,300}eulerQuat\(-0\.05/,
    )
  })

  it('GLB idle clip wires the canonical rest delta through the helper', () => {
    // glbAthlete must reach into glbAthleticPose for the basketball
    // ready offsets so the rest delta lives in ONE module.
    expect(GLB_SOURCE).toMatch(
      /import \{[\s\S]{0,200}BASKETBALL_READY_REST_DELTA[\s\S]{0,200}\} from '@\/lib\/scenario3d\/glbAthleticPose'/,
    )
    expect(GLB_SOURCE).toMatch(/appendBasketballReadyHoldTracks/)
  })

  it('GLB idle clip does NOT inline a -0.14 numeric thigh literal — the rest delta is sourced', () => {
    // Pre-FR-8 the idle clip had `-0.14` baked inline four times.
    // After Packet 3 those reads pull from BASKETBALL_READY_REST_DELTA.
    // The literal still exists in glbAthleticPose.ts (the data
    // module) — but should NOT exist as a track value inside
    // glbAthlete.ts.
    const inlineNumeric = GLB_SOURCE.match(
      /glbLowerBodyBindRelativeQuat\([^,]+,\s*-0\.14,/g,
    )
    expect(inlineNumeric).toBeNull()
  })
})

describe('FR-8 Packet 6 — colour palette parity', () => {
  it('GLB region palette is sourced from the audit module', () => {
    expect(GLB_SOURCE).toMatch(
      /import \{[\s\S]{0,200}GLB_ATHLETE_REGION_PALETTE[\s\S]{0,200}\} from '@\/lib\/scenario3d\/glbAthleteAudit'/,
    )
  })

  it('GLB_REGION_COLOR alias resolves to the audit palette — single source of truth', () => {
    expect(GLB_SOURCE).toMatch(
      /const GLB_REGION_COLOR\s*=\s*GLB_ATHLETE_REGION_PALETTE/,
    )
  })
})
