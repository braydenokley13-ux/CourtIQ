'use client'

import { useMemo } from 'react'
import type { CourtState } from '@/components/court'
import { buildScene, type Scene3D } from './scene'

interface ScenarioInput {
  id: string
  court_state?: CourtState | null
  scene?: unknown
  user_role?: string
  concept_tags?: string[]
  /**
   * Pack 2 Teaching-Quality wire-in — forward the source scenario's
   * decoder_tag and difficulty into buildScene so Scene3D carries
   * decoderTag + effectiveDifficulty. Without these, F6's
   * decoder-cue priority promotion stays dormant in production
   * (it has the helper but no input data).
   */
  decoder_tag?: string | null
  difficulty?: number | null
}

/**
 * Returns a stable, normalised Scene3D for a scenario. Uses authored scene
 * data when present, otherwise picks the matching concept preset, otherwise
 * synthesises from the legacy court_state. Always returns a valid Scene3D
 * (never null) when given a scenario, so the renderer always has data.
 */
export function useScenarioSceneData(scenario: ScenarioInput | null | undefined): Scene3D | null {
  return useMemo(() => {
    if (!scenario) return null
    return buildScene({
      id: scenario.id,
      court_state: scenario.court_state ?? undefined,
      scene: scenario.scene as Scene3D | undefined,
      user_role: scenario.user_role,
      concept_tags: scenario.concept_tags,
      decoder_tag: scenario.decoder_tag ?? undefined,
      difficulty: scenario.difficulty ?? undefined,
    })
  }, [scenario])
}
