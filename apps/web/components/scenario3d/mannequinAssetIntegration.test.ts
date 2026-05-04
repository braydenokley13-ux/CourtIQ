/**
 * Athlete-rendering reliability pass — bundled `mannequin.glb`
 * integration test.
 *
 * Companion to `productionGlbAssetGate.test.ts` (which locks the
 * URL string) and `closeoutAssetIntegration.test.ts` /
 * `backCutAssetIntegration.test.ts` (which lock the bundled clip
 * GLBs). This test parses the bundled athlete model from disk and
 * locks the structural shape the GLB renderer depends on:
 *
 *   1. The file at `apps/web/public/athlete/mannequin.glb` parses
 *      cleanly via `GLTFLoader.parse`.
 *   2. The parsed scene contains at least one `SkinnedMesh` (the
 *      cache builder rejects assets with zero skinned meshes —
 *      `loadGlbAthleteAsset` returns null in that case).
 *   3. The skeleton contains every bone the bespoke clips target
 *      (`GLB_BONE_MAP`), so the keyframe tracks bind successfully
 *      at runtime.
 *   4. The asset includes geometry attributes the clone path needs
 *      (`position`, `skinIndex`, `skinWeight`).
 *
 * If a future asset swap regresses any of these, the magenta marker
 * will appear in production whenever forceGlb=1 is set — this test
 * catches the regression before it lands.
 */

/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLB_ATHLETE_ASSET_URL, GLB_BONE_MAP } from './glbAthlete'

const MANNEQUIN_GLB_DISK_PATH = path.resolve(
  __dirname,
  '../../public/athlete/mannequin.glb',
)

async function parseBundledMannequin(): Promise<GLTF> {
  const buf = fs.readFileSync(MANNEQUIN_GLB_DISK_PATH)
  const arrayBuffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(arrayBuffer).set(buf)
  const loader = new GLTFLoader()
  return new Promise<GLTF>((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject)
  })
}

describe('mannequin.glb — disk presence + URL alignment', () => {
  it('the file at the disk path the URL maps to exists and is non-trivial', () => {
    expect(fs.existsSync(MANNEQUIN_GLB_DISK_PATH)).toBe(true)
    const stat = fs.statSync(MANNEQUIN_GLB_DISK_PATH)
    // The Quaternius UAL2 mannequin is ~1.4 MB; anything under 100 KB
    // is almost certainly truncated or wrong.
    expect(stat.size).toBeGreaterThan(100_000)
  })

  it('public URL constant matches the bundled disk path', () => {
    // The runtime fetches `/athlete/mannequin.glb` from Next.js's
    // public folder; the disk path resolves to the same file.
    expect(GLB_ATHLETE_ASSET_URL).toBe('/athlete/mannequin.glb')
    const expectedDisk = path.resolve(
      __dirname,
      '../../public',
      GLB_ATHLETE_ASSET_URL.replace(/^\//, ''),
    )
    expect(MANNEQUIN_GLB_DISK_PATH).toBe(expectedDisk)
  })
})

describe('mannequin.glb — GLTFLoader parse contract', () => {
  it('parses cleanly and exposes a scene with at least one SkinnedMesh', async () => {
    const gltf = await parseBundledMannequin()
    expect(gltf.scene).toBeInstanceOf(THREE.Object3D)
    let skinnedCount = 0
    let boneCount = 0
    let meshCount = 0
    gltf.scene.traverse((c) => {
      const obj = c as THREE.Object3D & {
        isSkinnedMesh?: boolean
        isMesh?: boolean
        isBone?: boolean
      }
      if (obj.isSkinnedMesh) skinnedCount += 1
      if (obj.isMesh) meshCount += 1
      if (obj.isBone) boneCount += 1
    })
    expect(skinnedCount).toBeGreaterThanOrEqual(1)
    expect(boneCount).toBeGreaterThanOrEqual(11) // GLB_BONE_MAP has 11 bone names
    expect(meshCount).toBeGreaterThanOrEqual(skinnedCount)
  })

  it('skeleton contains every bone the bespoke clips bind to', async () => {
    const gltf = await parseBundledMannequin()
    const present = new Set<string>()
    gltf.scene.traverse((c) => {
      if ((c as THREE.Bone).isBone) present.add(c.name)
    })
    const missing: string[] = []
    for (const sourceName of Object.values(GLB_BONE_MAP)) {
      if (!present.has(sourceName)) missing.push(sourceName)
    }
    expect(missing).toEqual([])
  })

  it('first SkinnedMesh has the geometry attributes cloneSkinned needs', async () => {
    const gltf = await parseBundledMannequin()
    let skinned: THREE.SkinnedMesh | null = null
    gltf.scene.traverse((c) => {
      if (skinned) return
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
        skinned = c as THREE.SkinnedMesh
      }
    })
    expect(skinned).not.toBeNull()
    const attrs = skinned!.geometry.attributes
    expect(attrs.position).toBeDefined()
    expect(attrs.skinIndex).toBeDefined()
    expect(attrs.skinWeight).toBeDefined()
    // SkinnedMesh.skeleton is populated after the loader resolves.
    expect(skinned!.skeleton).toBeDefined()
    expect(skinned!.skeleton.bones.length).toBeGreaterThan(0)
  })
})
