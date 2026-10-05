/** Native glTF parse/skin/animation verification, no browser or GPU required.
 * Run with Node 22: node scripts/athlete/validate_studio_athlete.mjs
 */
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import * as THREE from '../../apps/web/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
const names = ['offense_ready', 'defense_ready', 'defense_slide_left', 'defense_slide_right', 'cut_run', 'start_stop', 'screen_plant', 'pivot', 'receive', 'chest_pass', 'dribble', 'closeout', 'shot_release']
const report = []
for (const filename of ['lab-athlete.glb', 'lab-athlete-tactical.glb']) {
  const buffer = await fs.readFile(new URL(`../../apps/web/public/athlete/${filename}`, import.meta.url))
  const asset = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
  assert.deepEqual(asset.animations.map(c => c.name).sort(), [...names].sort())
  const meshes = []; const bones = []
  asset.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); if (o.isBone) bones.push(o) })
  assert(meshes.length > 0); assert.equal(bones.length, 65)
  assert(asset.scene.getObjectByName('LOD1_athlete'))
  assert.equal(!!asset.scene.getObjectByName('LOD0_athlete'), filename === 'lab-athlete.glb')
  let triangles = 0, vertices = 0
  for (const mesh of meshes) {
    const weight = mesh.geometry.attributes.skinWeight, index = mesh.geometry.attributes.skinIndex
    assert(weight && index)
    for (let i = 0; i < weight.count; i++) {
      const sum = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i)
      assert(Math.abs(sum - 1) < 1e-4, `${filename}: unnormalized skin weight at ${i}`)
      for (let j = 0; j < 4; j++) assert(index.array[i * 4 + j] < mesh.skeleton.bones.length)
    }
    vertices += mesh.geometry.attributes.position.count; triangles += mesh.geometry.index.count / 3
  }
  const mixer = new THREE.AnimationMixer(asset.scene), foot = new THREE.Vector3()
  let minAnkle = Infinity, maxAnkle = -Infinity, maxLoopGap = 0
  const clipStats = []
  for (const clip of asset.animations) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip); action.play(); action.paused = true
    const feet = ['foot_l', 'foot_r'].map(n => asset.scene.getObjectByName(n))
    const initial = []
    for (let i = 0; i <= 24; i++) {
      action.time = clip.duration * i / 24; mixer.update(0); asset.scene.updateMatrixWorld(true)
      feet.forEach((bone, j) => {
        bone.getWorldPosition(foot); assert(Number.isFinite(foot.x + foot.y + foot.z))
        minAnkle = Math.min(minAnkle, foot.y); maxAnkle = Math.max(maxAnkle, foot.y)
        assert(foot.y > .075, `${clip.name} foot penetrates floor: ${foot.y}`)
        assert(Math.abs(foot.x) < .65 && Math.abs(foot.z) < .55, `${clip.name} limb target outside athletic envelope`)
        if (!i) initial[j] = foot.clone()
        if (i === 24) maxLoopGap = Math.max(maxLoopGap, foot.distanceTo(initial[j]))
      })
      for (const mesh of meshes) {
        mesh.skeleton.update()
        // Check representative skinned vertices instead of only the undeformed bbox.
        for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 37) {
          const p = mesh.getVertexPosition(vertex, new THREE.Vector3())
          assert(Number.isFinite(p.x + p.y + p.z), `${clip.name}: nonfinite deformation`)
          assert(p.length() < 2.8, `${clip.name}: exploded skin vertex`)
        }
      }
    }
    const rootChannels = clip.tracks.filter(t => /^root\.(position|quaternion)|^CourtIQ_basketball_rig\./.test(t.name))
    assert.equal(rootChannels.length, 0, 'Simulation owns root motion')
    clipStats.push({ name: clip.name, tracks: clip.tracks.length, duration: Number(clip.duration.toFixed(4)) })
  }
  assert(maxLoopGap < .012, `Loop contact mismatch ${maxLoopGap}`)
  report.push({ filename, bytes: buffer.length, vertices, triangles, bones: bones.length, meshes: meshes.length, minAnkle: Number(minAnkle.toFixed(5)), maxAnkle: Number(maxAnkle.toFixed(5)), maxLoopGap: Number(maxLoopGap.toFixed(5)), clips: clipStats })
}
console.log(JSON.stringify(report, null, 2))
await fs.writeFile(new URL('../../apps/web/public/athlete/lab-athlete-validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
