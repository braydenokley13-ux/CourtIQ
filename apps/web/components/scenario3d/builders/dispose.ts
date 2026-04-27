import type * as THREE from 'three'

/**
 * Walks an Object3D subtree and disposes every BufferGeometry and Material
 * it finds. Imperative scene mutation makes GPU leaks easy — every builder
 * funnels its dispose through this helper so the contract is identical
 * everywhere. Lights, groups, and bare Object3Ds are no-ops here.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose()
    } else if (mat) {
      mat.dispose()
    }
  })
}
