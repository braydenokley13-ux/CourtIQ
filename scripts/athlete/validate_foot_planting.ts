/** Headless foot-planting audit of the REAL runtime (labAthlete.ts) + the shipped GLB.
 * Drives one athlete at constant velocity with the engine's phase accumulator, then measures
 * the world-space horizontal speed of the ball-of-foot bones while they are on the floor.
 * Skating = that speed relative to the ground. Run (from repo root):
 *   pnpm --filter @courtiq/web exec tsx --tsconfig tsconfig.json ../../scripts/athlete/validate_foot_planting.ts
 */
import fs from 'node:fs/promises'
import * as THREE from '../../apps/web/node_modules/three/build/three.module.js'
import { GLTFLoader } from '../../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { createLabAthlete, loadGlbAthleteAsset } from '../../apps/web/components/defense-lab/labAthlete'

async function main() {
  const buffer = await fs.readFile(new URL('../../apps/web/public/athlete/lab-athlete.glb', import.meta.url))
  const native = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
  GLTFLoader.prototype.loadAsync = async () => native
  const drawing = new Proxy({}, { get: (_t, key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined, set: () => true })
  globalThis.document = { createElement: () => ({ width: 128, height: 128, getContext: () => drawing }) } as unknown as Document
  await loadGlbAthleteAsset()
  const DT = .025
  type Case = { name: string; defensive: boolean; pose: string; heading: number; facing: number; speeds: number[] }
  // heading = direction of travel; facing = body yaw (0 = +z). Character-left of a +z-facing athlete is +x.
  const cases: Case[] = [
    { name: 'walk/jog/sprint forward', defensive: false, pose: 'run', heading: 0, facing: 0, speeds: [1.2, 2.0, 3.0, 4.2, 5.5] },
    { name: 'defensive chop/closeout forward', defensive: true, pose: 'closeout', heading: 0, facing: 0, speeds: [1.0, 2.0, 3.0] },
    { name: 'slide left', defensive: true, pose: 'defend', heading: Math.PI / 2, facing: 0, speeds: [1.0, 1.8, 2.4, 3.0, 3.6] },
    { name: 'slide right', defensive: true, pose: 'defend', heading: -Math.PI / 2, facing: 0, speeds: [1.0, 1.8, 2.4, 3.0, 3.6] },
    { name: 'backpedal', defensive: true, pose: 'defend', heading: Math.PI, facing: 0, speeds: [1.0, 2.0, 3.0] },
  ]
  const out: unknown[] = []
  for (const c of cases) for (const speed of c.speeds) {
    const a = createLabAthlete({ id: c.defensive ? 'D1' : 'O1', team: c.defensive ? 'defense' : 'offense', height: 1.88 }, 0, true)
    const balls = ['ball_l', 'ball_r'].map(n => a.figure.getObjectByName(n)!)
    const p = new THREE.Vector3(), prev = [new THREE.Vector3(), new THREE.Vector3()], cur = [new THREE.Vector3(), new THREE.Vector3()]
    let t = 0, phase = 0, v = 0, samples = 0, sumRel = 0, grounded = 0, total = 0, worst = 0
    const rel: number[] = []
    const stanceOf = (name: string) => (native.asset?.extras as { CourtIQMotion?: { clips: Record<string, { stanceFraction?: number }> } } | undefined)?.CourtIQMotion?.clips[name]?.stanceFraction ?? 0
    // A foot is "planted" for the authored stance interval of the active clip (10% guard at
    // each end for heel strike / toe-off). Only pure single-clip moments are audited.
    const planted = (k: number) => {
      const d = a.figure.userData.motionDebug as { clip: string; cycle: number; weights: Record<string, number> }
      if ((d.weights[d.clip] ?? 0) < .999 || !/walk|jog|sprint|chop|slide|backpedal/.test(d.clip)) return false
      const s = stanceOf(d.clip), q = (((d.cycle + (k ? .5 : 0)) % 1) + 1) % 1
      return q > s * .1 && q < s * .9
    }
    for (let i = 0; i < 280; i++) {
      t += DT; v = Math.min(speed, v + 6 * DT); phase += v * DT * 4.2
      p.x += Math.sin(c.heading) * v * DT; p.z += Math.cos(c.heading) * v * DT
      a.root.position.set(p.x, 0, p.z)
      a.setPose({ time: t, speed: v, velocity: { x: Math.sin(c.heading) * v, z: Math.cos(c.heading) * v }, defensive: c.defensive, pose: c.pose, phase, hands: c.pose === 'closeout' ? .9 : .5, hasBall: false, facing: c.facing })
      a.root.updateMatrixWorld(true)
      balls.forEach((b, k) => b.getWorldPosition(cur[k]))
      if (i > 140 && v >= speed - 1e-6) {
        balls.forEach((_, k) => {
          total++
          const onFloor = planted(k)
          if (!onFloor) return
          grounded++
          // ground speed of the planted foot: world displacement per second along the horizontal plane
          const dx = cur[k].x - prev[k].x, dz = cur[k].z - prev[k].z, s = Math.hypot(dx, dz) / DT
          rel.push(s); sumRel += s; samples++; worst = Math.max(worst, s)
        })
      }
      prev[0].copy(cur[0]); prev[1].copy(cur[1])
    }
    rel.sort((x, y) => x - y)
    out.push({ case: c.name, speed, plantedFraction: +(grounded / total).toFixed(2), meanSkate: +(sumRel / Math.max(1, samples)).toFixed(3), p90Skate: +(rel[Math.floor(rel.length * .9)] ?? 0).toFixed(3), skateOverSpeed: +((sumRel / Math.max(1, samples)) / speed).toFixed(3) })
  }
  console.log(JSON.stringify(out, null, 1))
  await fs.writeFile(new URL('../../apps/web/public/athlete/lab-athlete-planting.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
}
void main()
