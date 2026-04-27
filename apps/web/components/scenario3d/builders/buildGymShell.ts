import * as THREE from 'three'
import type { BuilderResult } from './types'

/**
 * Reserved for Packet 7: gym walls, ceiling/rafters, bleachers hint.
 * Packet 2 keeps this slot empty so the visual baseline is unchanged
 * — the orchestrator wires it in now so future work has a known place
 * to land.
 */
export function buildGymShell(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'gym-shell'
  return { object: group, dispose: () => undefined }
}
