/**
 * P0-LOCK-2 — test fixture helpers.
 *
 * Builds a faithful mock of the bundled Quaternius UAL2 mannequin GLB
 * for use under Vitest. The mock matches the real asset along the
 * dimensions every downstream code path actually depends on:
 *
 *   - Bone names match the real skeleton (audited from
 *     `apps/web/public/athlete/mannequin.glb` joints during P0-LOCK).
 *   - Bone hierarchy mirrors the Quaternius rig: root → pelvis →
 *     (spine_01..03 → neck_01 → Head, thigh_l/r → calf_l/r → foot_l/r,
 *     spine_03 → clavicle_l/r → upperarm_l/r → lowerarm_l/r → hand_l/r).
 *   - Bone rest-pose rotations carry non-trivial values so the mixer's
 *     keyframe writes are visibly distinguishable from the bind pose
 *     (the real Quaternius rest pose is not a T-pose).
 *   - The SkinnedMesh has a real BufferGeometry with `position`,
 *     `skinIndex`, and `skinWeight` attributes so `cloneSkinned` can
 *     re-bind the cloned skeleton without throwing.
 *
 * Out of scope (deliberately NOT mocked):
 *   - Any glTF metadata beyond `scene` (animations, materials,
 *     textures, asset string). The GLB cache only reads `scene`;
 *     spending bytes on the rest would be theatre.
 *   - Production-grade vertex counts. Three vertices wired to the
 *     pelvis bone is enough to make `THREE.SkinnedMesh.isSkinnedMesh`
 *     true and for `Box3.setFromObject(precise=true)` to compute a
 *     real skinned bounding box.
 */

import * as THREE from 'three'
import { GLB_BONE_MAP } from '../glbAthlete'

/**
 * The full Quaternius UAL2 bone topology, captured from the bundled
 * `mannequin.glb` during P0-LOCK. Exported as a list (not a tree) so
 * the helper can rebuild the parent-child links explicitly.
 */
const QUATERNIUS_BONE_TREE: ReadonlyArray<{
  name: string
  parent: string | null
  /** Local rest-pose translation (metres). */
  t?: [number, number, number]
  /** Local rest-pose rotation quaternion (xyzw). */
  r?: [number, number, number, number]
}> = [
  // Spine + head chain
  { name: 'root', parent: null, r: [-0.7071068, 0, 0, 0.7071068] },
  { name: 'pelvis', parent: 'root', t: [0, 0.0501, 0.9167], r: [0.7904685, 0, 0, 0.6125028] },
  { name: 'spine_01', parent: 'pelvis', t: [0, 0.13818, 0], r: [-0.0647026, 0, 0, 0.9979046] },
  { name: 'spine_02', parent: 'spine_01', t: [0, 0.12403, 0], r: [-0.0772798, 0, 0, 0.9970095] },
  { name: 'spine_03', parent: 'spine_02', t: [0, 0.14127, 0], r: [-0.0002686, 0, 0, 1] },
  { name: 'neck_01', parent: 'spine_03', t: [0, 0.17289, 0], r: [0.1109859, 0, 0, 0.9938220] },
  { name: 'Head', parent: 'neck_01', t: [0, 0.08259, 0], r: [-0.0786742, 0, 0, 0.9969004] },

  // Left leg
  { name: 'thigh_l', parent: 'pelvis', t: [0.089, 0.02777, 0.04602], r: [0.9924844, 0, 0, 0.1223706] },
  { name: 'calf_l', parent: 'thigh_l', t: [0, 0.40031, 0], r: [0.0365859, 0, 0, 0.9993305] },
  { name: 'foot_l', parent: 'calf_l', t: [0, 0.42948, 0], r: [-0.5290717, 0, 0, 0.8485770] },

  // Right leg
  { name: 'thigh_r', parent: 'pelvis', t: [-0.089, 0.02777, 0.04602], r: [0.9924844, 0, 0, 0.1223706] },
  { name: 'calf_r', parent: 'thigh_r', t: [0, 0.40031, 0], r: [0.0365859, 0, 0, 0.9993305] },
  { name: 'foot_r', parent: 'calf_r', t: [0, 0.42948, 0], r: [-0.5290717, 0, 0, 0.8485770] },

  // Left arm
  { name: 'clavicle_l', parent: 'spine_03', t: [0.0188, 0.14055, 0.08090], r: [-0.6292879, -0.2966185, -0.3067248, 0.6495646] },
  { name: 'upperarm_l', parent: 'clavicle_l', t: [-0.02119, 0.18942, -0.01696], r: [0.2320518, 0.6680781, -0.2315034, 0.6680044] },
  { name: 'lowerarm_l', parent: 'upperarm_l', t: [0, 0.22141, 0], r: [0.0192334, 0, 0, 0.9998150] },
  { name: 'hand_l', parent: 'lowerarm_l', t: [0, 0.27264, 0], r: [-0.0086198, 0, 0, 0.9999629] },

  // Right arm
  { name: 'clavicle_r', parent: 'spine_03', t: [-0.0188, 0.14055, 0.08090], r: [-0.6292879, 0.2966185, 0.3067248, 0.6495646] },
  { name: 'upperarm_r', parent: 'clavicle_r', t: [0.02119, 0.18942, -0.01696], r: [0.2320517, -0.6680781, 0.2315034, 0.6680044] },
  { name: 'lowerarm_r', parent: 'upperarm_r', t: [0, 0.22141, 0], r: [0.0192334, 0, 0, 0.9998150] },
  { name: 'hand_r', parent: 'lowerarm_r', t: [0, 0.27264, 0], r: [-0.0086198, 0, 0, 0.9999629] },
]

export interface MockGlbAsset {
  scene: THREE.Object3D
  skinnedMesh: THREE.SkinnedMesh
  bones: ReadonlyMap<string, THREE.Bone>
}

/**
 * Builds the mock glTF scene for the P0-LOCK-2 determinism tests.
 *
 * Returns a plain Object3D scene + the SkinnedMesh and a name-keyed
 * bone lookup so tests can both inject the cache and snapshot bone
 * transforms without re-traversing the cloned tree.
 */
export function buildMockGlbAsset(): MockGlbAsset {
  const scene = new THREE.Group()
  scene.name = 'mock-mannequin-scene'
  const armature = new THREE.Group()
  armature.name = 'Armature'
  scene.add(armature)

  // Build every bone, then assemble the parent-child links by name.
  // Two-pass so out-of-order entries (impossible today but cheap)
  // don't trip the parent lookup.
  const bones = new Map<string, THREE.Bone>()
  for (const entry of QUATERNIUS_BONE_TREE) {
    const bone = new THREE.Bone()
    bone.name = entry.name
    if (entry.t) bone.position.set(entry.t[0], entry.t[1], entry.t[2])
    if (entry.r) bone.quaternion.set(entry.r[0], entry.r[1], entry.r[2], entry.r[3])
    bones.set(entry.name, bone)
  }
  for (const entry of QUATERNIUS_BONE_TREE) {
    const bone = bones.get(entry.name)!
    if (entry.parent === null) {
      armature.add(bone)
    } else {
      const parent = bones.get(entry.parent)
      if (!parent) {
        throw new Error(`mock skeleton: bone "${entry.name}" lists unknown parent "${entry.parent}"`)
      }
      parent.add(bone)
    }
  }

  // Minimal SkinnedMesh — three vertices fully weighted to the
  // pelvis bone. The real Quaternius mesh is a single primitive with
  // ~10k vertices distributed across all bones, but for determinism
  // we only need the SkinnedMesh + Skeleton handshake to hold up
  // through clone, bind-pose bbox measurement, and per-tick mixer
  // updates. None of those depend on the vertex count.
  const geom = new THREE.BufferGeometry()
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0.0, 0.0,
        0.5, 0.0, 0.0,
        0.0, 1.8, 0.0,
      ],
      3,
    ),
  )
  geom.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  )
  geom.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4,
    ),
  )
  geom.setIndex([0, 1, 2])

  const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const skinnedMesh = new THREE.SkinnedMesh(geom, material)
  skinnedMesh.name = 'Mannequin'
  // The skeleton MUST be built from the bones reachable from `scene`
  // because cloneSkinned re-binds via parallelTraverse. Adding the
  // mesh as an Armature sibling matches the GLB layout dump.
  const skeleton = new THREE.Skeleton(QUATERNIUS_BONE_TREE.map((e) => bones.get(e.name)!))
  skinnedMesh.bind(skeleton, new THREE.Matrix4())
  armature.add(skinnedMesh)

  return { scene, skinnedMesh, bones }
}

/**
 * Convenience — quick sanity check that the mock contains every name
 * `GLB_BONE_MAP` references. If this throws, the determinism test
 * would silently produce a "no bones moved" false positive.
 */
export function assertMockCoversGlbBoneMap(asset: MockGlbAsset): void {
  for (const [intent, source] of Object.entries(GLB_BONE_MAP)) {
    if (!asset.bones.has(source)) {
      throw new Error(
        `mock skeleton missing GLB_BONE_MAP['${intent}'] -> '${source}'`,
      )
    }
  }
}
