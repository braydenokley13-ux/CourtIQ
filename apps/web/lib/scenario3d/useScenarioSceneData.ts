'use client'

import { useMemo } from 'react'
import type { CourtState } from '@/components/court'
import { buildScene, type Scene3D } from './scene'

interface ScenarioInput {
  id: string
  court_state: CourtState
  scene?: unknown
  user_role?: string
  concept_tags?: string[]
}

/**
 * Returns a stable, normalised Scene3D for a scenario. Uses authored scene
 * data when present, otherwise picks the matching concept preset, otherwise
 * synthesises from the legacy court_state.
 */
export function useScenarioSceneData(scenario: ScenarioInput | null | undefined): Scene3D | null {
  return useMemo(() => {
    if (!scenario) return null
    return buildScene({
      id: scenario.id,
      court_state: scenario.court_state,
      scene: scenario.scene as Scene3D | undefined,
      user_role: scenario.user_role,
      concept_tags: scenario.concept_tags,
    })
  }, [scenario])
}
