import type * as THREE from 'three'

/**
 * Standard contract for a scene builder. Each builder owns the THREE
 * objects it allocates and exposes an explicit `dispose` callback that
 * releases their GPU resources. The orchestrator (imperativeScene.ts)
 * adds `object` to the scene root and calls `dispose` on teardown.
 */
export interface BuilderResult {
  object: THREE.Object3D
  dispose: () => void
}

/**
 * Handle returned by the top-level scene builder. `root` is the single
 * group the renderer adds to THREE.Scene; `dispose` releases every
 * geometry, material, and texture allocated by every sub-builder.
 */
export interface SceneHandle {
  root: THREE.Group
  dispose: () => void
}
