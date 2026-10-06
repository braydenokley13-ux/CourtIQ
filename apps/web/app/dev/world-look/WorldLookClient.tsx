'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildLabEnvironment, setLabEnvironmentAnalytical, updateEnvironmentForCamera, setEnvironmentQuality, COURT, disposeTree, buildBall } from '@/components/defense-lab/labEnvironment'
import { configureWorldRenderer, createContactShadow } from '@/components/defense-lab/worldLook'
import { createLabAthlete, loadGlbAthleteAsset } from '@/components/defense-lab/labAthlete'
import { HIGH_PNR_PROBLEM } from '@/lib/defense-lab/scenario'

const VIEWS = {
  broadcast: { eye: [7, 7.5, 15.5], target: [0, 0.8, 5], fov: 39 },
  sideline: { eye: [8.8, 1.7, 12.8], target: [-1.5, 1.0, 4.2], fov: 46 },
  top: { eye: [0, 21, 7.5], target: [0, 0, 6.5], fov: 39 },
} as const

interface Stats { quality: string; calls: number; triangles: number; geometries: number; textures: number; textureMB: number; frameMs: number; lines: number }

function textureBytes(scene: THREE.Scene, env: THREE.Group): number {
  const seen = new Set<THREE.Texture>(); let bytes = 0
  const add = (t: THREE.Texture | null | undefined) => {
    if (!t || seen.has(t)) return; seen.add(t)
    const img = t.image as { width?: number; height?: number } | undefined
    if (!img?.width) return
    const mip = t.generateMipmaps ? 1.333 : 1
    bytes += img.width * (img.height ?? 1) * 4 * mip
  }
  scene.traverse(o => {
    const m = (o as THREE.Mesh).material
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) add(v)
  })
  const target = env.userData.environmentTarget as THREE.WebGLRenderTarget | undefined
  if (target) bytes += target.width * target.height * 8 // half-float RGBA cube-UV
  return bytes
}

export default function WorldLookClient() {
  const host = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const hud = params.get('hud') === '1'

  useEffect(() => {
    const container = host.current!
    const q = new URLSearchParams(window.location.search)
    const quality = (['low', 'balanced'].includes(q.get('quality') ?? '') ? q.get('quality') : 'high') as 'high' | 'balanced' | 'low'
    const view = VIEWS[(q.get('view') as keyof typeof VIEWS) in VIEWS ? (q.get('view') as keyof typeof VIEWS) : 'broadcast']
    const analytical = Math.min(1, Math.max(0, Number(q.get('analytical') ?? 0) || 0))
    const style = (q.get('style') === 'spectral' ? 'spectral' : 'night') as 'night' | 'spectral'
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' })
    renderer.setPixelRatio(1)
    configureWorldRenderer(renderer, quality)
    renderer.shadowMap.autoUpdate = false
    const canvas = renderer.domElement; canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(view.fov, 1, 0.06, 100)
    const env = buildLabEnvironment(scene, renderer, false, () => { renderer.shadowMap.needsUpdate = true; dirty = true }, { quality })
    const controls = new OrbitControls(camera, canvas)
    controls.target.set(...(view.target as unknown as [number, number, number])); camera.position.set(...(view.eye as unknown as [number, number, number])); controls.update()
    const then = q.get('then') as 'high' | 'balanced' | 'low' | null
    if (then) setTimeout(() => { setEnvironmentQuality(env, renderer, then); dirty = true }, 12000)
    let dirty = true, disposed = false, raf = 0
    const athletes: ReturnType<typeof createLabAthlete>[] = []
    const ball = buildBall(); scene.add(ball)
    void loadGlbAthleteAsset().then(ready => {
      if (disposed) return
      HIGH_PNR_PROBLEM.players.forEach((p, i) => {
        const a = createLabAthlete({ id: p.id, team: p.team, height: p.height, role: p.role }, i, ready)
        a.setQuality(quality === 'low' ? 'low' : 'high')
        a.root.position.set(p.start.x, 0, p.start.z)
        a.root.add(createContactShadow({ radius: 0.62 }))
        const toBall = Math.atan2(1.6 - p.start.x, 8.4 - p.start.z)
        const facing = p.team === 'defense' ? Math.atan2(p.start.x - 0, p.start.z - 1.575) * 0 + Math.atan2(1.6 - p.start.x, 8.4 - p.start.z) : Math.atan2(0 - p.start.x, 1.575 - p.start.z)
        void toBall
        a.setPose({ time: 0.5, speed: 0, defensive: p.team === 'defense', hasBall: p.id === 'O1', facing, pose: p.team === 'defense' ? 'defensive' : 'idle', hands: 0.3 })
        scene.add(a.root); athletes.push(a)
      })
      const o1 = HIGH_PNR_PROBLEM.players[0]
      ball.position.set(o1.start.x + 0.25, 1.0, o1.start.z - 0.2)
      renderer.shadowMap.needsUpdate = true; dirty = true
    })
    const resize = () => { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true }
    resize(); window.addEventListener('resize', resize)
    let frames = 0, measured = false
    const loop = () => {
      raf = requestAnimationFrame(loop)
      setLabEnvironmentAnalytical(env, analytical, style); updateEnvironmentForCamera(env, camera)
      if (!dirty && frames > 4 && measured) return
      dirty = false; frames++
      renderer.render(scene, camera)
      if (frames >= 4 && athletes.length === 10 && !measured && hud) {
        measured = true
        const gl = renderer.getContext()
        const info = renderer.info
        let envCalls = 0; env.traverseVisible(o => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.Sprite).isSprite) envCalls += Array.isArray(m.material) ? m.material.length : 1 }); ;(window as unknown as { __envCalls: number }).__envCalls = envCalls; const calls = info.render.calls, triangles = info.render.triangles, lines = info.render.lines
        renderer.shadowMap.needsUpdate = true
        const sync = () => { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }; sync(); const t0 = performance.now(); const N = 12
        for (let i = 0; i < N; i++) { renderer.shadowMap.needsUpdate = i === 0; renderer.render(scene, camera); sync() }
        const frameMs = (performance.now() - t0) / N
        const s: Stats = { quality, calls, triangles, lines, geometries: info.memory.geometries, textures: info.memory.textures, textureMB: textureBytes(scene, env) / 1048576, frameMs }
        ;(window as unknown as { __worldStats: Stats }).__worldStats = s
        setStats(s)
      }
    }
    // keep rendering during load so late GLBs show up
    const keep = setInterval(() => { dirty = true }, 1500); setTimeout(() => clearInterval(keep), 40000)
    loop()
    return () => { disposed = true; cancelAnimationFrame(raf); clearInterval(keep); window.removeEventListener('resize', resize); controls.dispose(); athletes.forEach(a => disposeTree(a.root)); disposeTree(env); renderer.dispose(); canvas.remove() }
  }, [hud])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {hud && stats && (
        <pre data-world-stats style={{ position: 'absolute', left: 8, top: 8, margin: 0, padding: 8, background: 'rgba(0,0,0,.7)', color: '#9fe', font: '12px monospace' }}>
          {`quality ${stats.quality} envCalls ${(window as unknown as { __envCalls: number }).__envCalls}\ncalls ${stats.calls}  tris ${stats.triangles}\ngeoms ${stats.geometries}  tex ${stats.textures}  ~${stats.textureMB.toFixed(1)} MB\nframe ${stats.frameMs.toFixed(1)} ms (swiftshader)`}
        </pre>
      )}
      <span hidden>{COURT.length}</span>
    </div>
  )
}
