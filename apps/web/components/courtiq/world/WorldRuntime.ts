import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlayerId, PlayerState, Point2 } from '@/lib/defense-lab/types'
import { bodyCapsules } from '@/lib/defense-lab/analyticalGeometry'
import { DEFAULT_ASSUMPTIONS } from '@/lib/defense-lab/scenario'
import { tagDepthFromFloorPoint } from '@/lib/defense-lab/tagGuide'
import { buildBall, buildLabEnvironment, disposeTree, setLabEnvironmentAnalytical } from '../../defense-lab/labEnvironment'
import { createLabAthlete, loadGlbAthleteAsset, type LabAthlete } from '../../defense-lab/labAthlete'
import { DirectorCamera } from './camera'
import { MarkLayer, TONES, resolveAnchor } from './marks'
import type { CameraMode, WorldCallbacks, WorldScene } from './types'

type RimUniforms = { uXray: { value: number }; uRim: { value: THREE.Color }; uFade: { value: number } }

/** Imperative world. React hands it a WorldScene; it renders on demand,
 * continuously only while something actually moves. */
export class WorldRuntime {
  readonly canvas: HTMLCanvasElement
  readonly software: boolean
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(36, 1, 0.08, 120)
  private controls: OrbitControls
  private director: DirectorCamera
  private environment: THREE.Group
  private athletes = new Map<PlayerId, LabAthlete>()
  private rims = new Map<PlayerId, RimUniforms[]>()
  private shadows = new Map<PlayerId, THREE.Mesh>()
  private ball: THREE.Group
  private marks: MarkLayer
  private ghost: { root: THREE.Group; shafts: THREE.InstancedMesh; caps: THREE.InstancedMesh; t: THREE.Object3D }
  private tag: { root: THREE.Group; rail: THREE.Mesh; handle: THREE.Mesh; hit: THREE.Mesh }
  private dropRing: THREE.Mesh
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private state: WorldScene | null = null
  private dirty = true
  private raf = 0
  private disposed = false
  private lastTick = 0
  private xray = 0
  private xrayTarget = 0
  private glbReady = false
  private labelLayer: HTMLElement | null = null
  private drag: { kind: 'player'; id: PlayerId; x: number; y: number; target: Point2; moved: boolean } | { kind: 'tag'; depth: number } | null = null
  private orbiting = false
  private lastMode: CameraMode | null = null
  private scale = 1
  private slow = 0
  private fast = 0
  private frames = 0
  private fpsAt = 0
  private fps = 0
  private quality: 'high' | 'low'
  private observer: ResizeObserver
  private viewKey = ''

  constructor(private host: HTMLElement, private callbacks: WorldCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    const gl = this.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info')
    this.software = info ? /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) : false
    this.quality = this.software ? 'low' : 'high'
    this.scale = Math.min(window.devicePixelRatio || 1, this.software ? 1 : 1.75)
    this.renderer.setPixelRatio(this.scale)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    void import('../../defense-lab/worldLook').then(mod => {
      const configure = (mod as { configureWorldRenderer?: (r: THREE.WebGLRenderer, q: 'high' | 'low') => void }).configureWorldRenderer
      if (configure && !this.disposed) { configure(this.renderer, this.quality); this.dirty = true }
    }).catch(() => {})
    this.canvas = this.renderer.domElement
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', 'Basketball court. Click a defender to coach him. Drag to look around.')
    host.appendChild(this.canvas)

    this.environment = buildLabEnvironment(this.scene, this.renderer, this.software, () => { this.dirty = true; this.renderer.shadowMap.needsUpdate = true })
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12
    this.controls.minDistance = 3; this.controls.maxDistance = 34
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.screenSpacePanning = true
    this.controls.addEventListener('start', () => { this.orbiting = true })
    this.controls.addEventListener('change', () => {
      this.dirty = true
      if (this.orbiting && this.state && this.state.camera !== 'free') this.callbacks.onCameraMode?.('free')
    })
    this.controls.addEventListener('end', () => { this.orbiting = false })
    this.director = new DirectorCamera(this.camera)

    this.ball = buildBall(); this.scene.add(this.ball)
    this.marks = new MarkLayer(this.scene)
    this.ghost = this.createGhost()
    this.tag = this.createTagHandle()
    this.dropRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 48), new THREE.MeshBasicMaterial({ color: TONES.defense, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }))
    this.dropRing.rotation.x = -Math.PI / 2; this.dropRing.visible = false; this.scene.add(this.dropRing)

    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host)
    this.resize()
    this.bindInput()
    void loadGlbAthleteAsset().then(ok => { if (!this.disposed && ok) { this.glbReady = true; this.rebuildAthletes() } })
    this.callbacks.onReady?.({ webgl: true, software: this.software })
    this.raf = requestAnimationFrame(this.tick)
  }

  setLabelLayer(el: HTMLElement | null) { this.labelLayer = el; this.dirty = true }

  setScene(next: WorldScene) {
    const prev = this.state
    this.state = next
    if (!prev || prev.frame.players.length !== next.frame.players.length) this.rebuildAthletes()
    if (!prev || prev.frame !== next.frame) this.renderer.shadowMap.needsUpdate = true
    this.xrayTarget = next.lens === 'normal' ? 0 : 1
    this.dirty = true
  }

  /** Project a court point to canvas pixels. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 }
  }

  recenter() { this.director.adopt(this.controls.target); this.lastMode = null; this.dirty = true }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf); this.observer.disconnect(); this.controls.dispose()
    this.marks.clear()
    this.environment.userData.disposed = true
    disposeTree(this.scene)
    ;(this.environment.userData.environmentTarget as THREE.WebGLRenderTarget | undefined)?.dispose()
    this.renderer.dispose(); this.canvas.remove()
  }

  // ---------------------------------------------------------------- build

  private rebuildAthletes() {
    if (!this.state) return
    for (const [, a] of this.athletes) { this.scene.remove(a.root); disposeTree(a.root) }
    for (const [, s] of this.shadows) { this.scene.remove(s); s.geometry.dispose(); (s.material as THREE.Material).dispose() }
    this.athletes.clear(); this.rims.clear(); this.shadows.clear()
    const shadowTex = contactShadowTexture()
    this.state.frame.players.forEach((player, i) => {
      const athlete = createLabAthlete(player, i, this.glbReady)
      athlete.setQuality(this.quality)
      const uniforms: RimUniforms[] = []
      const rim = new THREE.Color(player.team === 'defense' ? TONES.defense : TONES.offense)
      athlete.figure.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const std = m as THREE.MeshStandardMaterial
          if (!std.isMeshStandardMaterial) continue
          const u: RimUniforms = { uXray: { value: 0 }, uRim: { value: rim.clone() }, uFade: { value: 1 } }
          uniforms.push(u)
          std.onBeforeCompile = shader => {
            shader.uniforms.uXray = u.uXray; shader.uniforms.uRim = u.uRim; shader.uniforms.uFade = u.uFade
            shader.fragmentShader = 'uniform float uXray;\nuniform vec3 uRim;\nuniform float uFade;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float rimTerm = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
  vec3 analytical = gl_FragColor.rgb * 0.18 + uRim * (0.10 + rimTerm * 1.25);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, analytical, uXray);
  gl_FragColor.rgb *= mix(1.0, 0.28, 1.0 - uFade);`)
          }
          std.customProgramCacheKey = () => 'courtiq-rim'
          std.needsUpdate = true
        }
      })
      // Labels are DOM; the athlete's own sprite/ring are retired in this world.
      athlete.label.visible = false; athlete.ring.visible = false
      this.rims.set(player.id, uniforms)
      this.athletes.set(player.id, athlete); this.scene.add(athlete.root)
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55, color: '#000000' }))
      shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1
      this.shadows.set(player.id, shadow); this.scene.add(shadow)
    })
    this.dirty = true
  }

  private createGhost() {
    const root = new THREE.Group(); root.name = 'alternate-world'
    const mat = new THREE.MeshBasicMaterial({ color: TONES.ghost, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })
    const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), mat, 140)
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, 280)
    shafts.frustumCulled = caps.frustumCulled = false
    shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    root.add(shafts, caps); this.scene.add(root)
    return { root, shafts, caps, t: new THREE.Object3D() }
  }

  private createTagHandle() {
    const root = new THREE.Group(); root.visible = false
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.07), new THREE.MeshBasicMaterial({ color: TONES.defense, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }))
    rail.rotation.x = -Math.PI / 2
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }))
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), new THREE.MeshBasicMaterial({ visible: false }))
    root.add(rail, handle, hit); this.scene.add(root)
    return { root, rail, handle, hit }
  }

  // ---------------------------------------------------------------- input

  private setPointer(e: PointerEvent) {
    const b = this.canvas.getBoundingClientRect()
    this.pointer.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }
  private pickPlayer(e: PointerEvent): PlayerId | null {
    this.setPointer(e)
    const hits = this.raycaster.intersectObjects([...this.athletes.values()].map(a => a.hit), false)
    return (hits[0]?.object.userData.playerId as PlayerId | undefined) ?? null
  }
  private floorPoint(e: PointerEvent): Point2 | null {
    this.setPointer(e)
    const p = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.ground, p) ? { x: THREE.MathUtils.clamp(p.x, -7.25, 7.25), z: THREE.MathUtils.clamp(p.z, 0.4, 14) } : null
  }

  private bindInput() {
    const c = this.canvas
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !this.state) return
      const s = this.state
      if (s.tagGuide?.editable && s.editable && !s.playing && this.tag.root.visible) {
        this.setPointer(e)
        if (this.raycaster.intersectObject(this.tag.hit, false).length) {
          e.stopImmediatePropagation(); this.controls.enabled = false; c.setPointerCapture(e.pointerId)
          this.drag = { kind: 'tag', depth: s.tagGuide.tagDepth }; return
        }
      }
      const id = this.pickPlayer(e)
      if (!id) return
      const b = c.getBoundingClientRect()
      this.callbacks.onSelect?.(id, { x: e.clientX - b.left, y: e.clientY - b.top })
      const p = s.frame.players.find(q => q.id === id)
      if (p?.team === 'defense' && s.editable && !s.playing && s.camera !== 'player') {
        e.stopImmediatePropagation(); this.controls.enabled = false; c.setPointerCapture(e.pointerId)
        this.drag = { kind: 'player', id, x: e.clientX, y: e.clientY, target: { x: p.x, z: p.z }, moved: false }
      }
    }
    const move = (e: PointerEvent) => {
      if (this.drag?.kind === 'tag') {
        const pt = this.floorPoint(e); const g = this.state?.tagGuide
        if (pt && g) { this.drag.depth = tagDepthFromFloorPoint(g, pt); this.callbacks.onTagDepth?.(this.drag.depth, false); this.dirty = true }
        return
      }
      if (this.drag?.kind === 'player') {
        if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 6) this.drag.moved = true
        const pt = this.floorPoint(e); if (pt) this.drag.target = pt
        this.dirty = true; return
      }
      if (e.buttons) return
      const id = this.pickPlayer(e)
      if (id !== (this.state?.hoverId ?? null)) this.callbacks.onHover?.(id)
      c.style.cursor = id ? 'pointer' : 'grab'
    }
    const up = (e: PointerEvent) => {
      const d = this.drag; this.drag = null; this.controls.enabled = this.state?.camera !== 'player'
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId)
      if (d?.kind === 'tag') this.callbacks.onTagDepth?.(d.depth, true)
      if (d?.kind === 'player' && d.moved) this.callbacks.onMove?.(d.id, d.target)
      this.dirty = true
    }
    const click = (e: MouseEvent) => {
      // Empty-court click clears selection (but not after an orbit drag).
      if (this.pickPlayer(e as PointerEvent)) return
      if ((e as PointerEvent).detail === 1 && !this.orbiting) this.callbacks.onSelect?.(null, null)
    }
    const leave = () => this.callbacks.onHover?.(null)
    c.addEventListener('pointerdown', down, true); c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('pointerleave', leave)
    c.addEventListener('click', click)
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(this.raf) })
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect()
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    this.camera.aspect = Math.max(1, width) / Math.max(1, height); this.viewKey = ''; this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  // ---------------------------------------------------------------- frame

  private tick = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    const s = this.state
    if (!s) return
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 1 / 60
    this.lastTick = now
    let animating = false

    // Analytical transition.
    if (this.xray !== this.xrayTarget) {
      const step = dt / 0.45
      this.xray = this.xrayTarget > this.xray ? Math.min(this.xrayTarget, this.xray + step) : Math.max(this.xrayTarget, this.xray - step)
      animating = true; this.dirty = true
    }

    // Safe area: shift the principal point so the play composes beside UI panels.
    const inset = s.inset ?? {}
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1
    const l = inset.left ?? 0, r = inset.right ?? 0, tp = inset.top ?? 0, b = inset.bottom ?? 0
    const ox = (r - l) / 2, oy = (b - tp) / 2
    const key = `${W}:${H}:${ox}:${oy}`
    if (key !== this.viewKey) {
      this.viewKey = key
      if (ox || oy) this.camera.setViewOffset(W, H, ox, oy, W, H); else this.camera.clearViewOffset()
      this.director.fitAspect = Math.max(0.5, (W - l - r)) / Math.max(1, H - tp - b)
      this.dirty = true
    }

    // Camera.
    const modeChanged = this.lastMode !== s.camera
    if (modeChanged) {
      if (s.camera === 'free') this.controls.target.copy(this.director.target)
      else if (this.lastMode === 'free' || this.lastMode === null) this.director.adopt(this.lastMode === null ? this.director.target : this.controls.target)
      this.controls.enabled = s.camera !== 'player'
      this.lastMode = s.camera
    }
    if (s.camera === 'free') {
      if (this.controls.update()) animating = true
    } else if (!this.orbiting) {
      if (this.director.step(s.camera, s.frame, s.focus, s.pov, dt, false)) { animating = true; this.dirty = true }
      this.controls.target.copy(this.director.target)
    } else this.controls.update()

    if (s.playing || this.drag) this.dirty = true
    const marksAnimate = this.marks.update(s.marks, s.frame, now, 1)
    if (marksAnimate) { animating = true; this.dirty = true }
    if (!this.dirty && !animating) return
    this.dirty = false

    this.applyFrame(s, now)
    setLabEnvironmentAnalytical(this.environment, this.xray, 'porcelain')
    this.renderer.render(this.scene, this.camera)
    this.writeLabels(s)
    this.adapt(now, s.playing || animating)
  }

  private applyFrame(s: WorldScene, now: number) {
    const frame = s.frame
    const highlight = s.highlight && s.highlight.length ? new Set(s.highlight) : null
    for (const p of frame.players) {
      const a = this.athletes.get(p.id); if (!a) continue
      a.root.position.set(p.x, p.pose.jump, p.z)
      a.setPose({ time: frame.t, speed: Math.hypot(p.vx, p.vz), velocity: { x: p.vx, z: p.vz }, defensive: p.team === 'defense', pose: p.pose.stance, phase: p.pose.phase, hands: p.pose.hands, ball: frame.ball, hasBall: frame.ball.owner === p.id && frame.ball.phase !== 'pass', facing: p.yaw })
      const hidden = s.camera === 'player' && p.id === s.pov
      a.figure.visible = !hidden
      const fade = highlight ? (highlight.has(p.id) ? 1 : 0) : 1
      for (const u of this.rims.get(p.id) ?? []) { u.uXray.value = this.xray; u.uFade.value = fade }
      const shadow = this.shadows.get(p.id)
      if (shadow) { shadow.position.set(p.x, 0.012, p.z); (shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - this.xray * 0.6) * (hidden ? 0 : 1) }
    }
    this.ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z)
    this.ball.rotation.set(frame.t * 6, frame.t * 1.3, 0)
    this.ball.visible = frame.ball.phase !== 'dead' || true

    // Ghost world.
    const g = s.ghost
    this.ghost.root.visible = !!g
    if (g) {
      let si = 0, ci = 0
      const t = this.ghost.t, upv = new THREE.Vector3(0, 1, 0)
      for (const p of g.players) {
        if (p.team !== 'defense') continue
        const now2 = frame.players.find(q => q.id === p.id)
        if (now2 && Math.hypot(now2.x - p.x, now2.z - p.z) < 0.15) continue
        for (const c of bodyCapsules(p as PlayerState, DEFAULT_ASSUMPTIONS)) {
          const a = new THREE.Vector3(c.a.x, c.a.y, c.a.z), b = new THREE.Vector3(c.b.x, c.b.y, c.b.z), dir = b.clone().sub(a)
          t.position.copy(a).add(b).multiplyScalar(0.5); t.scale.set(c.radius, Math.max(1e-4, dir.length()), c.radius)
          t.quaternion.identity(); if (dir.lengthSq() > 1e-10) t.quaternion.setFromUnitVectors(upv, dir.normalize())
          t.updateMatrix(); this.ghost.shafts.setMatrixAt(si++, t.matrix)
          for (const q of [a, b]) { t.position.copy(q); t.scale.setScalar(c.radius); t.quaternion.identity(); t.updateMatrix(); this.ghost.caps.setMatrixAt(ci++, t.matrix) }
        }
      }
      this.ghost.shafts.count = si; this.ghost.caps.count = ci
      this.ghost.shafts.instanceMatrix.needsUpdate = this.ghost.caps.instanceMatrix.needsUpdate = true
    }

    // Tag handle.
    const guide = s.tagGuide
    const showTag = !!guide?.editable && s.editable && !s.playing && s.selectedId === guide.defenderId
    this.tag.root.visible = showTag
    if (guide && showTag) {
      const depth = this.drag?.kind === 'tag' ? this.drag.depth : guide.tagDepth
      const a = guide.home, b = guide.commit
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
      this.tag.rail.scale.set(len, 1, 1)
      this.tag.rail.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2)
      this.tag.rail.rotation.set(-Math.PI / 2, 0, Math.atan2(-(b.z - a.z), b.x - a.x))
      const hx = a.x + (b.x - a.x) * depth, hz = a.z + (b.z - a.z) * depth
      this.tag.handle.position.set(hx, 0.05, hz); this.tag.hit.position.set(hx, 0.15, hz)
      const pulse = 1 + 0.08 * Math.sin(now / 260)
      this.tag.handle.scale.set(pulse, 1, pulse)
    }

    // Drag target ring.
    const drag = this.drag?.kind === 'player' && this.drag.moved ? this.drag : null
    this.dropRing.visible = !!drag
    if (drag) this.dropRing.position.set(drag.target.x, 0.03, drag.target.z)
  }

  private writeLabels(s: WorldScene) {
    const layer = this.labelLayer
    if (!layer) return
    const nodes = layer.querySelectorAll<HTMLElement>('[data-anchor]')
    nodes.forEach(node => {
      const anchor = node.dataset.anchor!
      const lift = Number(node.dataset.lift ?? '0')
      let pt: { x: number; z: number } | null, y = lift
      if (anchor.startsWith('pt:')) { const [x, z] = anchor.slice(3).split(',').map(Number); pt = { x, z } }
      else {
        pt = resolveAnchor(s.frame, anchor as PlayerId)
        const p = s.frame.players.find(q => q.id === anchor)
        if (p) y = p.height + 0.28 + lift
      }
      if (!pt) { node.style.opacity = '0'; return }
      const pr = this.project(pt.x, y, pt.z)
      node.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0)`
      node.style.opacity = pr.visible ? '' : '0'
    })
  }

  private adapt(now: number, active: boolean) {
    this.frames++
    if (now - this.fpsAt > 1000) {
      this.fps = this.frames * 1000 / (now - this.fpsAt); this.frames = 0; this.fpsAt = now
      const info = this.renderer.info.render
      this.callbacks.onStats?.({ fps: Math.round(this.fps), scale: this.scale, calls: info.calls, triangles: info.triangles })
      if (!active) return
      // Hysteresis: degrade resolution first, recover slowly. Never the simulation.
      if (this.fps < 40) { this.slow++; this.fast = 0 } else if (this.fps > 57) { this.fast++; this.slow = 0 }
      const max = Math.min(window.devicePixelRatio || 1, this.software ? 1 : 1.75), min = this.software ? 0.6 : 0.85
      if (this.slow >= 2 && this.scale > min) { this.scale = Math.max(min, this.scale - 0.2); this.renderer.setPixelRatio(this.scale); this.slow = 0; if (this.scale <= 1) this.setQuality('low') }
      else if (this.fast >= 6 && this.scale < max) { this.scale = Math.min(max, this.scale + 0.15); this.renderer.setPixelRatio(this.scale); this.fast = 0 }
    }
  }

  private setQuality(q: 'high' | 'low') {
    if (this.quality === q) return
    this.quality = q
    for (const a of this.athletes.values()) a.setQuality(q)
  }
}

function contactShadowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(canvas)
  // Alpha from luminance: draw as alphaMap on black.
  return t
}
