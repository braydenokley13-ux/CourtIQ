import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import { disposeObject3D } from './dispose'
import type { BuilderResult } from './types'

/**
 * Realistic gym lighting rig with one shadow-casting key light, a cool
 * directional fill, a hemisphere wash, and a small ambient floor.
 *
 * Tuning rationale:
 *   - Ambient is intentionally LOW (0.32). Real gym light comes from a
 *     few overhead arrays plus bounce off the floor; a high ambient
 *     would flatten the contrast and erase the very shadows we are
 *     adding here.
 *   - Hemisphere fills in a soft sky/floor wash that warms the shadow
 *     side without compressing them — the sky color matches the canvas
 *     background, the ground color is taken from the hardwood so the
 *     bounce reads as gym wood, not generic gray.
 *   - Key directional is warm-white at ~1.55 intensity, angled from the
 *     +x baseline corner so player shadows lengthen across the court.
 *     PCFSoft shadows are already enabled by `Scenario3DCanvas.tsx`.
 *   - Fill directional is cool-white, low intensity, opposite side, no
 *     shadow casting — exists purely to keep the off-key side of every
 *     player from going muddy.
 *
 * Cleanup: the orchestrator's `disposeObject3D` walk handles lights and
 * the dummy target via the standard geometry/material pass; the shadow
 * map render target is owned by the WebGLRenderer and freed when the
 * canvas tears down.
 */
export function buildLighting(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'lighting'

  // Soft sky / floor wash. The sky tone matches the canvas background
  // so the unlit horizon doesn't clip; the ground tone matches the
  // hardwood so the underside of every player picks up a hint of warm
  // bounce.
  const hemi = new THREE.HemisphereLight(0xe5eefc, 0x3a2a14, 0.55)
  hemi.position.set(0, 80, 0)
  group.add(hemi)

  // Low-level ambient floor — keeps the deepest shadow side of any
  // surface readable without flattening contrast.
  const ambient = new THREE.AmbientLight(0xfff1e0, 0.32)
  group.add(ambient)

  // ---- Key light (shadow caster) --------------------------------------
  const key = new THREE.DirectionalLight(0xfff5dd, 1.55)
  // Positioned high and slightly off-center along +x / +z so player
  // shadows fall away from the basket toward half-court — the broadcast
  // camera reads this as "afternoon gym".
  key.position.set(28, 90, 18)
  key.castShadow = true

  // Aim at the court midpoint by default; the directional needs an
  // explicit target so the shadow camera frustum is oriented correctly.
  // Adding the target as a child of the group ensures it ships with the
  // builder and gets disposed alongside the lights.
  const keyTarget = new THREE.Object3D()
  keyTarget.position.set(0, 0, COURT.halfLengthFt / 2)
  group.add(keyTarget)
  key.target = keyTarget

  // Shadow map: 2048² gives ~30 px/ft over the half-court without the
  // memory cost of 4096². Bias and normalBias values picked to keep
  // floor acne off the hardwood and prevent peter-panning under the
  // cylindrical players from Packet 2.
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.04
  // Soft penumbra; only takes effect with PCFSoftShadowMap, which the
  // renderer enables in Scenario3DCanvas onCreated.
  key.shadow.radius = 4

  // Orthographic shadow frustum. Sized to cover the full half-court in
  // x and z plus a margin for player heights and the hoop assembly,
  // and clipped tightly in z so the depth-buffer precision is spent
  // where it matters.
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const margin = 6
  const shadowCam = key.shadow.camera as THREE.OrthographicCamera
  shadowCam.left = -halfW - margin
  shadowCam.right = halfW + margin
  shadowCam.top = halfL + margin
  shadowCam.bottom = -margin
  shadowCam.near = 10
  shadowCam.far = 220
  shadowCam.updateProjectionMatrix()
  group.add(key)

  // ---- Cool fill (no shadow) ------------------------------------------
  const fill = new THREE.DirectionalLight(0xb6c8e6, 0.55)
  fill.position.set(-28, 50, 30)
  fill.castShadow = false
  group.add(fill)

  // ---- Subtle warm rim from behind the basket -------------------------
  // Cheap accent that puts a soft highlight on the back of player
  // shoulders / heads when they face the half-court. No shadow casting.
  const rim = new THREE.DirectionalLight(0xffd7a8, 0.35)
  rim.position.set(0, 25, -20)
  rim.castShadow = false
  group.add(rim)

  return { object: group, dispose: () => disposeObject3D(group) }
}
