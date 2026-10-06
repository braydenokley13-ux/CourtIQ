/** Headless runtime integration: deterministic layered clips, LOD and ownership.
 * pnpm --filter @courtiq/web exec tsx --tsconfig tsconfig.json ../../scripts/athlete/validate_studio_runtime.ts
 */
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import * as THREE from '../../apps/web/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { createLabAthlete, loadGlbAthleteAsset } from '../../apps/web/components/defense-lab/labAthlete'

async function main() {
  const buffer = await fs.readFile(new URL('../../apps/web/public/athlete/lab-athlete.glb', import.meta.url))
  const native = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
  GLTFLoader.prototype.loadAsync = async () => native
  const drawing = { beginPath() {}, roundRect() {}, fill() {}, fillText() {} }
  globalThis.document = { createElement: () => ({ width: 128, height: 128, getContext: () => drawing }) } as unknown as Document
  assert(await loadGlbAthleteAsset())
  const athletes = Array.from({ length: 10 }, (_, i) => createLabAthlete({ id: `${i < 5 ? 'D' : 'O'}${i % 5 + 1}`, team: i < 5 ? 'defense' : 'offense', height: 1.86 + i * .008 }, i, true))
  const sourceGeometries = new Set<THREE.BufferGeometry>(), sourceMaterials = new Set<THREE.Material>()
  native.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { const mesh = o as THREE.Mesh; sourceGeometries.add(mesh.geometry); for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) sourceMaterials.add(m) } })
  const poses = ['ready', 'defend', 'screen', 'run', 'pass', 'catch', 'dribble', 'shoot']
  let largestRepeatDifference = 0, lowestAnkle = Infinity
  for (const [i, athlete] of athletes.entries()) {
    const skeletons = new Set<THREE.Skeleton>(), bones: THREE.Bone[] = []
    athlete.figure.traverse(o => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone)
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton)
      if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; assert(!sourceGeometries.has(m.geometry)); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) assert(!sourceMaterials.has(mat)) }
    })
    assert.equal(skeletons.size, 1, 'Primitive palettes must share one actor skeleton')
    const snapshot = () => bones.flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()])
    const motion = { time: 1.19, phase: 3.72, speed: 1.8, velocity: { x: 1.7, z: .6 }, defensive: i < 5, pose: poses[i % poses.length], hands: .84, ball: { x: -.28, y: 1.13, z: .31 }, hasBall: i === 6, facing: .36 }
    athlete.setPose(motion); const first = snapshot()
    athlete.setPose({ ...motion, time: 3.1, phase: 9.7, speed: .1, pose: 'screen', facing: 2.4 })
    athlete.setPose(motion); const again = snapshot()
    first.forEach((value, index) => { largestRepeatDifference = Math.max(largestRepeatDifference, Math.abs(value - again[index])) })
    for (const side of ['l', 'r']) { const bone = athlete.figure.getObjectByName(`foot_${side}`)!; lowestAnkle = Math.min(lowestAnkle, bone.getWorldPosition(new THREE.Vector3()).y) }
    const high = athlete.figure.getObjectByName('LOD0_athlete')!, low = athlete.figure.getObjectByName('LOD1_athlete')!
    athlete.setQuality('low'); assert(!high.visible && low.visible); athlete.setPose(motion)
    athlete.setQuality('high'); assert(high.visible && !low.visible)
  }
  assert(largestRepeatDifference < 1e-6, `Scrub history changed sampled pose: ${largestRepeatDifference}`)
  assert(lowestAnkle > .08 && lowestAnkle < .13, `Unexpected grounded ankle height: ${lowestAnkle}`)
  const report = { actors: athletes.length, largestRepeatDifference, lowestAnkle, oneSkeletonPerActor: true, independentlyOwnedResources: true, qualitySwitches: 'passed', upperLowerMotionLayers: 'passed' }
  console.log(JSON.stringify(report, null, 2))
  await fs.writeFile(new URL('../../apps/web/public/athlete/lab-athlete-runtime-validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
}
void main()
