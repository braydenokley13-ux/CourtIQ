'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createLabAthlete, loadGlbAthleteAsset, type AthleteMotion, type LabAthlete } from '@/components/defense-lab/labAthlete'

/** Minimal stand-in for the engine: integrates position/yaw/phase exactly like
 * lib/defense-lab/simulation.ts (phase += speed * dt * 4.2, accel-limited velocity,
 * rate-limited yaw) so the review stage exercises the same AthleteMotion inputs. */
interface Cmd { vx: number; vz: number; yaw: number; pose: string; hands: number; hasBall?: boolean; passU?: number }
interface Agent {
  id: string; team: 'offense' | 'defense'; number: number; x0: number; z0: number
  script: (t: number) => Cmd
  athlete?: LabAthlete
  s: { x: number; z: number; vx: number; vz: number; yaw: number; phase: number }
}
const DT = 0.025
const TWO_PI = Math.PI * 2
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const faceCamera = 0 // yaw 0 faces +z (toward the camera)

function gallery(): Agent[] {
  const agents: Agent[] = []
  const add = (id: string, team: 'offense' | 'defense', number: number, x: number, z: number, script: (t: number) => Cmd) =>
    agents.push({ id, team, number, x0: x, z0: z, script, s: { x, z, vx: 0, vz: 0, yaw: team === 'defense' ? 0 : Math.PI, phase: (agents.length * 1.7) % TWO_PI } })
  const dx = [-5.4, -2.7, 0, 2.7, 5.4]
  // Defense (dark) - front row
  add('D1', 'defense', 1, dx[0], 2.2, () => ({ vx: 0, vz: 0, yaw: faceCamera, pose: 'defend', hands: .6 }))
  add('D2', 'defense', 2, dx[1], 2.2, t => ({ vx: Math.cos(t * 1.4) * 2.4, vz: 0, yaw: faceCamera, pose: 'defend', hands: .6 }))
  add('D3', 'defense', 3, dx[2], 2.2, t => {
    // closeout: sprint -> chop -> hold high hand, then reset
    const u = t % 5
    if (u < 1.3) return { vx: 0, vz: 5.2 * (1 - u / 1.3) ** .7, yaw: faceCamera, pose: 'closeout', hands: .9 }
    if (u < 3.6) return { vx: 0, vz: 0, yaw: faceCamera, pose: 'closeout', hands: .9 }
    return { vx: 0, vz: -2.6, yaw: faceCamera, pose: 'defend', hands: .6 }
  })
  add('D4', 'defense', 4, dx[3], 3.6, t => ({ vx: 0, vz: -Math.cos(t * 1.1) * 2.2, yaw: faceCamera, pose: 'defend', hands: .6 }))
  add('D5', 'defense', 5, dx[4], 2.2, t => {
    const u = t % 6
    return u < 3 ? { vx: 0, vz: 0, yaw: faceCamera, pose: 'screen', hands: .2 } : { vx: 0, vz: 0, yaw: faceCamera + .5, pose: 'fight', hands: .6 }
  })
  // Offense (light) - back row, facing the camera too so numbers on the chest are visible
  add('O1', 'offense', 11, dx[0], -1.2, t => {
    const a = t * 1.5; return { vx: Math.cos(a) * 3.2, vz: -Math.sin(a) * 3.2, yaw: Math.atan2(Math.cos(a), -Math.sin(a)), pose: 'run', hands: .2 }
  })
  add('O2', 'offense', 22, dx[1], -3.5, t => {
    const dir = Math.sin(t * 2.2) >= 0 ? 1 : -1; return { vx: 0, vz: 2.4 * dir, yaw: dir > 0 ? 0 : Math.PI, pose: 'run', hands: .2 }
  })
  add('O3', 'offense', 33, dx[2], -1.2, t => {
    const u = t % 4
    const pose = u < 1.6 ? 'catch' : u < 2.6 ? 'pass' : 'ready'
    return { vx: 0, vz: 0, yaw: faceCamera, pose, hands: .8, hasBall: u >= 1.6 && u < 2.6, passU: u - 1.6 }
  })
  add('O4', 'offense', 44, dx[3], -1.2, t => ({ vx: Math.sin(t * .9) * 1.3, vz: 0, yaw: Math.sign(Math.cos(t * .9)) > 0 ? Math.PI / 2 : -Math.PI / 2, pose: 'dribble', hands: .25, hasBall: true }))
  add('O5', 'offense', 55, dx[4], -1.2, t => {
    const u = t % 4
    return u < 2 ? { vx: 0, vz: 0, yaw: faceCamera, pose: 'ready', hands: .2 } : { vx: 0, vz: 0, yaw: faceCamera, pose: 'shoot', hands: .8 }
  })
  return agents
}

type TrackMode = 'slide' | 'run' | 'jog' | 'walk' | 'back' | 'chop' | 'sprint'
function track(mode: TrackMode, speed: number, dirLeft: boolean): Agent[] {
  const defensive = mode === 'slide' || mode === 'back' || mode === 'chop'
  const sgn = dirLeft ? -1 : 1 // character-left of a +z facing athlete is -x
  const script = (): Cmd => {
    if (mode === 'slide') return { vx: sgn * speed, vz: 0, yaw: 0, pose: 'defend', hands: .6 }
    if (mode === 'back') return { vx: 0, vz: -speed, yaw: 0, pose: 'defend', hands: .6 }
    if (mode === 'chop') return { vx: 0, vz: speed, yaw: 0, pose: 'closeout', hands: .9 }
    return { vx: speed, vz: 0, yaw: Math.PI / 2, pose: 'run', hands: .2 }
  }
  return [{ id: defensive ? 'D1' : 'O1', team: defensive ? 'defense' : 'offense', number: 7, x0: -1, z0: 0, script, s: { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, phase: 0 } }]
}

function floorTexture() {
  const size = 1024, canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#c4985f'; ctx.fillRect(0, 0, size, size)
  for (let y = 0; y < size; y += 32) {
    for (let x = -((y / 32) * 97) % 320; x < size; x += 320) { const tint = Math.floor(((x * 7 + y * 13) % 11)); ctx.fillStyle = `rgb(${186 + tint},${140 + tint},${88 + tint})`; ctx.fillRect(x, y, 319, 31) }
  }
  ctx.strokeStyle = 'rgba(40,24,10,.5)'; ctx.lineWidth = 2
  for (let i = 0; i <= 8; i++) { const p = i * (size / 8); ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke() }
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(size, 2); ctx.moveTo(2, 0); ctx.lineTo(2, size); ctx.stroke()
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(5, 5)
  return t
}

export function AthleteStudioClient() {
  const host = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState('')
  useEffect(() => {
    const el = host.current!
    const q = new URLSearchParams(window.location.search)
    const scenario = q.get('scenario') ?? 'gallery'
    const frozen = q.has('t') ? Number(q.get('t')) : null
    const cam = q.get('cam') ?? (scenario === 'track' ? 'side' : 'broadcast')
    const focus = Number(q.get('focus') ?? 2)
    const turntable = q.get('turntable') === '1'
    const quality = (q.get('quality') ?? 'high') as 'high' | 'balanced' | 'low'
    const w = Number(q.get('w') ?? 1280), h = Number(q.get('h') ?? 720)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1); renderer.setSize(w, h)
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = .95
    renderer.shadowMap.enabled = q.get('noshadow') !== '1'; renderer.shadowMap.type = THREE.PCFShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10151a')
    const pm = new THREE.PMREMGenerator(renderer)
    scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .55
    const camera = new THREE.PerspectiveCamera(32, w / h, .1, 100)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .55, metalness: 0 }))
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
    scene.add(new THREE.HemisphereLight('#d9e6f2', '#6b5a48', .55))
    const key = new THREE.DirectionalLight('#fff3df', 2.4); key.position.set(-5, 9, 6); key.castShadow = true
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9; key.shadow.camera.far = 30; key.shadow.bias = -.0004; key.shadow.normalBias = .02
    scene.add(key); scene.add(key.target)
    const rim = new THREE.DirectionalLight('#bcd6ff', .9); rim.position.set(6, 5, -7); scene.add(rim)

    const ball = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 14), new THREE.MeshStandardMaterial({ color: '#d2672b', roughness: .7 })); ball.castShadow = true; scene.add(ball)

    let disposed = false, raf = 0
    const agents = scenario === 'track'
      ? track((q.get('mode') ?? 'slide') as TrackMode, Number(q.get('speed') ?? 2.2), (q.get('dir') ?? 'left') === 'left')
      : gallery()
    let time = 0
    let ballShown = false
    function stepAgents() {
      time += DT; ballShown = false
      for (const a of agents) {
        const cmd = a.script(time), s = a.s
        const ax = 6 * DT
        s.vx += clamp(cmd.vx - s.vx, -ax, ax); s.vz += clamp(cmd.vz - s.vz, -ax, ax)
        s.x += s.vx * DT; s.z += s.vz * DT
        s.yaw += clamp(wrapAngle(cmd.yaw - s.yaw), -9 * DT, 9 * DT)
        const speed = Math.hypot(s.vx, s.vz); s.phase += speed * DT * 4.2
        if (!a.athlete) continue
        // Ball: a dribbled ball bounces in front; a passed/caught ball sits in the hands.
        let ballPos = { x: s.x + Math.sin(s.yaw) * .22, y: .5 + Math.abs(Math.sin(time * 9)) * .65, z: s.z + Math.cos(s.yaw) * .22 }
        if (cmd.pose === 'pass' || cmd.pose === 'catch' || cmd.pose === 'shoot') ballPos = { x: s.x + Math.sin(s.yaw) * (cmd.pose === 'catch' ? .55 : .3), y: cmd.pose === 'shoot' ? 1.9 : 1.3, z: s.z + Math.cos(s.yaw) * (cmd.pose === 'catch' ? .55 : .3) }
        if (cmd.pose === 'pass') { const d = .3 + 7 * Math.max(0, cmd.passU ?? 0); ballPos = { x: s.x + Math.sin(s.yaw) * d, y: 1.3, z: s.z + Math.cos(s.yaw) * d } }
        if (cmd.hasBall) { ballShown = true; ball.position.set(ballPos.x, ballPos.y, ballPos.z) }
        a.athlete.root.position.set(s.x, 0, s.z)
        const motion: AthleteMotion = { time, speed, velocity: { x: s.vx, z: s.vz }, defensive: a.team === 'defense', pose: cmd.pose, phase: s.phase, hands: cmd.hands, ball: ballPos, hasBall: !!cmd.hasBall, facing: s.yaw }
        a.athlete.setPose(motion)
        if (a === agents[Math.min(focus, agents.length - 1)]) {
          const trace = ((window as unknown as { __footTrace?: number[][] }).__footTrace ??= [])
          const p = new THREE.Vector3(), row = [time, s.x, s.z, Math.hypot(s.vx, s.vz)]
          for (const name of ['foot_l', 'foot_r']) { a.athlete.figure.getObjectByName(name)!.getWorldPosition(p); row.push(p.x, p.y, p.z) }
          const dbg = a.athlete.figure.userData.motionDebug as { lockOn: boolean[] }; row.push(dbg.lockOn[0] ? 1 : 0, dbg.lockOn[1] ? 1 : 0); trace.push(row)
        }
      }
      ball.visible = ballShown
    }
    const spawn = () => {
      agents.forEach((a, i) => {
        a.athlete = createLabAthlete({ id: a.id, team: a.team, number: a.number, height: [1.86, 1.99, 1.91, 1.83, 2.03][i % 5] }, i, true)
        a.athlete.setQuality(quality); a.athlete.label.visible = false; a.athlete.ring.visible = false
        scene.add(a.athlete.root)
      })
    }
    let hudTimer = 0
    function frame(now: number, last: number) {
      const center = new THREE.Vector3(0, .95, scenario === 'track' ? 0 : 0.6)
      const f = agents[Math.min(focus, agents.length - 1)]
      if (scenario === 'track') center.set(f.s.x, .95, f.s.z)
      else if (cam === 'close') center.set(f.s.x, 1.0, f.s.z)
      const angle = turntable ? now * .00035 : 0
      const eye = new THREE.Vector3()
      if (scenario === 'track') {
        const side = q.get('mode') === 'back' || q.get('mode') === 'chop' ? [3.4, 1.4, 0] : cam === 'front' ? [0, 1.5, 3.8] : [0, 1.4, 3.6]
        eye.set(center.x + side[0], side[1], center.z + side[2])
        camera.fov = 30
      } else if (cam === 'close') { eye.set(center.x + Math.sin(angle + .5) * 3.4, 1.8, center.z + Math.cos(angle + .5) * 3.4); camera.fov = 30 }
      else if (cam === 'side') { eye.set(14, 2.2, 1); center.set(0, 1, 0.6); camera.fov = 30 }
      else if (cam === 'front') { eye.set(0, 2.0, 13); center.set(0, 1, 0.6); camera.fov = 30 }
      else if (cam === 'top') { eye.set(0, 14, 9); center.set(0, 0, 0.4); camera.fov = 32 }
      else { eye.set(Math.sin(angle) * 15.5, 7.2, Math.cos(angle) * 15.5 + .8); camera.fov = 30; center.set(0, .85, .4) }
      camera.position.copy(eye); camera.lookAt(center); camera.updateProjectionMatrix()
      key.target.position.copy(center); key.position.set(center.x - 5, 9, center.z + 6)
      renderer.render(scene, camera)
      ;(window as unknown as { __rinfo?: object }).__rinfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }
      hudTimer += 1
      if (hudTimer % 10 === 0 && f.athlete) {
        const d = f.athlete.figure.userData.motionDebug as { clip: string; stride: number; cadence: number; special: string } | undefined
        setHud(`t=${time.toFixed(2)}  ${f.id} speed ${Math.hypot(f.s.vx, f.s.vz).toFixed(2)} m/s  clip ${d?.clip} stride ${d?.stride.toFixed(2)} m cadence ${d?.cadence.toFixed(2)}/s ${d?.special ?? ''}`)
      }
      void last
    }
    const wrapper = el as HTMLDivElement & { __ready?: boolean }
    loadGlbAthleteAsset().then(() => {
      if (disposed) return
      spawn()
      if (frozen !== null) {
        while (time < frozen - 1e-9) stepAgents()
        frame(0, 0); wrapper.__ready = true; document.body.dataset.ready = '1'
        // Deterministic stepping hook for screenshot sequences (see scripts/athlete/shot_sequence.mjs).
        ;(window as unknown as { __studioAdvance: (s: number) => number }).__studioAdvance = seconds => {
          const end = time + seconds
          while (time < end - 1e-9) stepAgents()
          frame(0, 0); return time
        }
        return
      }
      let acc = 0, prev = performance.now()
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop)
        acc += Math.min(.1, (now - prev) / 1000); prev = now
        while (acc >= DT) { stepAgents(); acc -= DT }
        frame(now, prev)
        document.body.dataset.ready = '1'
      }
      raf = requestAnimationFrame(loop)
    })
    return () => { disposed = true; cancelAnimationFrame(raf); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [])
  return (
    <div style={{ background: '#0b0f13', minHeight: '100vh', color: '#cfd8dc', font: '12px/1.4 ui-monospace, monospace' }}>
      <div ref={host} />
      <div style={{ padding: '6px 10px' }}>{hud}</div>
    </div>
  )
}
