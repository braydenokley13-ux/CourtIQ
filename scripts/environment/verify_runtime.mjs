/** Load the shipped files using the application's Three.js GLTFLoader, CPU only. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as THREE from '../../apps/web/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from '../../apps/web/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js'

const root = new URL('../../apps/web/public/environment/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
let totalBytes = 0
for (const [filename, budget] of Object.entries(manifest.assets)) {
  const bytes = await readFile(new URL(filename, root))
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  let triangles = 0, meshes = 0
  const materials = new Set()
  gltf.scene.traverse(object => {
    if (!object.isMesh) return
    meshes += 1
    assert.equal(object.isSkinnedMesh, undefined, 'Equipment must have no skeleton update cost')
    assert.equal(Array.isArray(object.material), false, 'One material per merged mesh')
    const material = object.material
    materials.add(material)
    assert.equal(material.side, THREE.FrontSide, 'Closed geometry must cull backfaces')
    assert.equal(material.map, null, 'Unexpected texture download')
    assert.equal(material.normalMap, null, 'Unexpected normal-map download')
    const geometry = object.geometry
    assert(geometry.index, 'Indexed geometry required')
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    assert.equal(normals.count, positions.count)
    for (let i = 0; i < positions.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        assert(Number.isFinite(positions.array[i * 3 + axis]), 'Non-finite position')
        assert(Number.isFinite(normals.array[i * 3 + axis]), 'Non-finite normal')
      }
      const magnitude = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))
      assert(Math.abs(magnitude - 1) < .01, 'Exported normals must be normalized')
    }
    for (const index of geometry.index.array) assert(index < positions.count, 'Index outside vertex buffer')
    triangles += geometry.index.count / 3
  })
  const bounds = new THREE.Box3().setFromObject(gltf.scene)
  for (let i = 0; i < 3; i++) {
    assert(Math.abs(bounds.min.getComponent(i) - budget.bounds.min[i]) < .00001, 'Local origin/bounds changed')
    assert(Math.abs(bounds.max.getComponent(i) - budget.bounds.max[i]) < .00001, 'Local origin/bounds changed')
  }
  // Meshopt packing (gltfpack) drops degenerate triangles; never more, never >1% fewer.
  assert(triangles <= budget.triangles && triangles >= budget.triangles * 0.99, `triangles ${triangles} vs budget ${budget.triangles}`)
  assert.equal(meshes, budget.drawCalls)
  assert.equal(materials.size, budget.materials)
  assert.equal(bytes.byteLength, budget.bytes)
  assert(triangles < 20000 && meshes <= 5 && bytes.byteLength < 500000, 'Coach hardware budget exceeded')
  assert.equal(gltf.animations.length, 0, 'Equipment must remain static')
  if (filename === 'courtiq-hoop.glb') {
    let glassMesh, rimMesh
    gltf.scene.traverse(object => {
      if (object.isMesh && object.material.name.includes('tempered glass')) glassMesh = object
      if (object.isMesh && object.material.name.includes('rim enamel')) rimMesh = object
    })
    const glass = glassMesh?.material
    assert(glass?.transparent && glass.opacity < .3, 'Board should preserve tactical visibility')
    assert.equal(glass.transmission, undefined, 'Board must avoid a separate transmission target')
    assert.deepEqual(manifest.placement.hoop.rimCenter, [0, 3.048, 1.575])
    const board = new THREE.Box3().setFromObject(glassMesh)
    assert(Math.abs(board.min.y - 2.8956) < .00001, 'Board lower edge must be six inches below the rim')
    assert(Math.abs(board.getSize(new THREE.Vector3()).x - 1.8288) < .00001, 'Board must be 72 inches wide')
    assert(Math.abs(board.getSize(new THREE.Vector3()).y - 1.0668) < .00001, 'Board must be 42 inches tall')
    const rim = new THREE.Box3().setFromObject(rimMesh)
    const outerRadius = .2286 + .0119 * 2
    assert(Math.abs(rim.max.x - outerRadius) < .00001 && Math.abs(rim.min.x + outerRadius) < .00001, 'Rim must provide an 18-inch clear opening')
    assert(Math.abs(rim.max.z - outerRadius - 1.575) < .00001, 'Basket center must retain court coordinates')
    const rimPositions = rimMesh.geometry.getAttribute('position')
    let rimMinY = Infinity, rimMaxY = -Infinity
    for (let i = 0; i < rimPositions.count; i++) {
      if (Math.abs(rimPositions.getX(i)) > .24) {
        rimMinY = Math.min(rimMinY, rimPositions.getY(i))
        rimMaxY = Math.max(rimMaxY, rimPositions.getY(i))
      }
    }
    assert(Math.abs((rimMinY + rimMaxY) / 2 - 3.048) < .00001, 'Rim center must stay ten feet above the floor')
  }
  totalBytes += bytes.byteLength
  gltf.scene.traverse(object => { if (object.isMesh) object.geometry.dispose() })
  for (const material of materials) material.dispose()
  console.log(`${filename}: ${triangles.toLocaleString()} triangles, ${meshes} draws, ${(bytes.byteLength / 1024).toFixed(1)} KiB — loaded`)
}
assert(totalBytes < 500000, 'Entire initial equipment download must fit 500 KB')
console.log(`Equipment checks passed; ${(totalBytes / 1024).toFixed(1)} KiB total; source ${fileURLToPath(new URL('./source/courtiq-gym-equipment.blend', import.meta.url))}`)
