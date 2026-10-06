import * as THREE from 'three'
import type { PlayerState, WorldFrame } from '@/lib/defense-lab/types'
import { bodyCapsules } from '@/lib/defense-lab/analyticalGeometry'
import { DEFAULT_ASSUMPTIONS } from '@/lib/defense-lab/scenario'
import { TONES, MARK_ORDER } from './marks'

/** Alternate-world bodies as holograms: the same body capsules the engine reasons
 * with, drawn with a fresnel rim and a rising scanline in the ghost tone. Only
 * defenders who truly stand somewhere else are drawn (difference-only). */
export const GHOST_MIN_SEPARATION = 0.3

export interface GhostWorld {
  root: THREE.Group
  shafts: THREE.InstancedMesh
  caps: THREE.InstancedMesh
  t: THREE.Object3D
  /** Draw the divergent defenders of `other` relative to `frame`. Returns true while animating. */
  update(frame: WorldFrame, other: WorldFrame | null, now: number): boolean
}

const UP = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), B = new THREE.Vector3(), DIR = new THREE.Vector3()

function hologramMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(TONES.ghost) }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normalize(mat3(instanceMatrix) * normal));
  vV = normalize(cameraPosition - wp.xyz); vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uOpacity; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float scan = smoothstep(0.55, 0.9, 0.5 + 0.5 * sin(vY * 70.0 - uTime * 0.003));
  float a = (0.1 + f * 0.62 + scan * 0.1) * uOpacity;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), f * 0.35), a);
}`,
  })
}

export function createGhostWorld(radial = 10, sphere: [number, number] = [12, 8]): GhostWorld {
  const root = new THREE.Group(); root.name = 'alternate-world'
  const mat = hologramMaterial()
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, radial), mat, 140)
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, sphere[0], sphere[1]), mat, 280)
  for (const m of [shafts, caps]) { m.frustumCulled = false; m.renderOrder = MARK_ORDER.main; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0 }
  root.add(shafts, caps)
  const t = new THREE.Object3D()
  return {
    root, shafts, caps, t,
    update(frame, other, now) {
      root.visible = !!other
      if (!other) return false
      mat.uniforms.uTime.value = now
      let si = 0, ci = 0
      for (const p of other.players) {
        if (p.team !== 'defense') continue
        const mine = frame.players.find(q => q.id === p.id)
        if (mine && Math.hypot(mine.x - p.x, mine.z - p.z) < GHOST_MIN_SEPARATION) continue
        for (const c of bodyCapsules(p as PlayerState, DEFAULT_ASSUMPTIONS)) {
          A.set(c.a.x, c.a.y, c.a.z); B.set(c.b.x, c.b.y, c.b.z); DIR.copy(B).sub(A)
          t.position.copy(A).add(B).multiplyScalar(0.5); t.scale.set(c.radius, Math.max(1e-4, DIR.length()), c.radius)
          t.quaternion.identity(); if (DIR.lengthSq() > 1e-10) t.quaternion.setFromUnitVectors(UP, DIR.normalize())
          t.updateMatrix(); shafts.setMatrixAt(si++, t.matrix)
          t.position.copy(A); t.scale.setScalar(c.radius); t.quaternion.identity(); t.updateMatrix(); caps.setMatrixAt(ci++, t.matrix)
          t.position.copy(B); t.updateMatrix(); caps.setMatrixAt(ci++, t.matrix)
        }
      }
      shafts.count = si; caps.count = ci
      shafts.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true
      return si > 0
    },
  }
}
