import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlayerId, PlayerState, Point2 } from '@/lib/defense-lab/types'
import { tagDepthFromFloorPoint } from '@/lib/defense-lab/tagGuide'
import * as Env from '../../defense-lab/labEnvironment'
import { buildBall, buildLabEnvironment, disposeTree, setLabEnvironmentAnalytical, updateEnvironmentForCamera } from '../../defense-lab/labEnvironment'
import { configureWorldRenderer } from '../../defense-lab/worldLook'
import { createLabAthlete, loadGlbAthleteAsset, type LabAthlete } from '../../defense-lab/labAthlete'
import { DirectorCamera } from './camera'
import { createGhostWorld, type GhostWorld } from './ghost'
import { MarkLayer, TONES, resolveAnchor, setMarkDetail } from './marks'
import { PerfRecorder, round, type SegmentSummary } from './perf'
import { AdaptiveController, chooseInitialTier, gpuWarmup, probeDevice, readOverride, refineTier, tierSettings, writeOverride, type DeviceProbe, type QualityOverride, type QualityTier } from './quality'
import type { CameraMode, WorldCallbacks, WorldScene, WorldStats } from './types'

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
  /** One instanced draw for every athlete's contact shadow (was one mesh + material per athlete). */
  private contactShadows: THREE.InstancedMesh | null = null
  private readonly shadowDummy = new THREE.Object3D()
  private ball: THREE.Group
  private marks: MarkLayer
  private ghost: GhostWorld
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
  private frames = 0
  private fpsAt = 0
  private fps = 0
  private observer: ResizeObserver
  private viewKey = ''
  private cpu = 0
  // ---- quality / perf (see quality.ts, perf.ts)
  readonly probe: DeviceProbe
  private tier: QualityTier
  private tierReason = ''
  private override: QualityOverride
  private controller: AdaptiveController
  private perf: PerfRecorder
  private lastRenderAt = 0
  private nodraw = false
  private lastXray = -1
  private viewW = 1
  private viewH = 1
  private tierAdjusted = false
  private view: WorldScene | null = null
  private tierShadows = true
  private shadowStride = 1
  private shadowTick = 0
  private contactTex: THREE.CanvasTexture | null = null
  private warm: MarkLayer | null = null
  private labelObserver: MutationObserver | null = null
  private lastChange: { at: number; why: string } | null = null
  private readonly proj = new THREE.Vector3()

  constructor(private host: HTMLElement, private callbacks: WorldCallbacks) {
    // Capability probe on a throwaway context: MSAA is fixed at context creation, so the
    // initial tier must be known before the real renderer exists.
    const search = window.location.search
    this.override = readOverride(search)
    this.nodraw = new URLSearchParams(search).has('nodraw')
    const early = probeEarly()
    const initial = chooseInitialTier(early, this.override)
    this.tier = initial.tier; this.tierReason = initial.reason
    const st = tierSettings(this.tier)
    this.renderer = new THREE.WebGLRenderer({ antialias: st.antialias, alpha: false, powerPreference: 'high-performance' })
    const gl = this.renderer.getContext()
    this.probe = probeDevice(gl)
    this.software = this.probe.software
    this.perf = new PerfRecorder(gl)
    this.scale = Math.min(this.probe.devicePixelRatio, st.maxPixelRatio)
    this.controller = new AdaptiveController(this.tier, this.scale, this.override !== 'auto')
    this.renderer.setPixelRatio(this.scale)
    configureWorldRenderer(this.renderer, this.tier === 'high' ? 'high' : 'low')
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    if (this.override === 'auto') void gpuWarmup(this.probe).then(w => {
      this.probe.warmupMs = w.ms; this.probe.warmupMethod = w.method
      // Refine once, before the coach has had time to notice: at most one step.
      if (this.disposed || this.override !== 'auto' || this.tierAdjusted) return
      const refined = refineTier(this.tier, w.ms)
      if (refined !== this.tier) { this.tierReason += `; warm-up ${w.ms?.toFixed(1)} ms`; this.applyTier(refined, 'warmup') }
    })
    this.canvas = this.renderer.domElement
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', 'Basketball court. Click a defender to coach him. Drag to look around.')
    host.appendChild(this.canvas)

    this.environment = buildLabEnvironment(this.scene, this.renderer, this.software, () => { this.dirty = true; this.renderer.shadowMap.needsUpdate = true }, { quality: st.environment === 'low' ? 'low' : 'high' })
    this.applyShadows(st)
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
    setMarkDetail(st.markDetail)
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
    this.callbacks.onTier?.(this.tier)
    this.raf = requestAnimationFrame(this.tick)
  }

  setLabelLayer(el: HTMLElement | null) { this.labelLayer = el; this.dirty = true }

  setScene(next: WorldScene) {
    const prev = this.state
    this.state = next
    this.view = next.live ? Object.assign(Object.create(next) as WorldScene, { frame: next.frame, ghost: next.ghost }) : null
    if (!prev || prev.frame.players.length !== next.frame.players.length) this.rebuildAthletes()
    if (!prev || prev.frame !== next.frame) this.renderer.shadowMap.needsUpdate = true
    this.xrayTarget = next.lens === 'normal' ? 0 : 1
    if (prev && next.impact !== undefined && next.impact !== prev.impact) this.director.kick(1)
    this.dirty = true
  }

  /** Project a court point to canvas pixels. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.proj.set(x, y, z).project(this.camera)
    const w = this.viewW, h = this.viewH
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 }
  }

  recenter() { this.director.adopt(this.controls.target); this.lastMode = null; this.dirty = true }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf); this.observer.disconnect(); this.controls.dispose()
    this.marks.clear(); this.warm?.clear(); this.perf.dispose(); this.labelObserver?.disconnect(); this.contactTex?.dispose(); this.contactTex = null
    this.environment.userData.disposed = true
    disposeTree(this.scene)
    ;(this.environment.userData.environmentTarget as THREE.WebGLRenderTarget | undefined)?.dispose()
    this.renderer.dispose(); this.canvas.remove()
  }

  // ---------------------------------------------------------------- build

  private rebuildAthletes() {
    if (!this.state) return
    for (const [, a] of this.athletes) { this.scene.remove(a.root); disposeTree(a.root) }
    if (this.contactShadows) { this.scene.remove(this.contactShadows); this.contactShadows.geometry.dispose(); (this.contactShadows.material as THREE.Material).dispose(); this.contactShadows.dispose(); this.contactShadows = null }
    this.athletes.clear(); this.rims.clear()
    const shadowTex = this.contactTex ??= contactShadowTexture(tierSettings(this.tier).contactShadowTex)
    this.state.frame.players.forEach((player, i) => {
      const athlete = createLabAthlete(player, i, this.glbReady)
      setAthleteQuality(athlete, tierSettings(this.tier).athlete)
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
    })
    this.warmShaders()
    const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55, color: '#000000' }), this.state.frame.players.length)
    blobs.renderOrder = 1; blobs.frustumCulled = false; blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.contactShadows = blobs; this.scene.add(blobs)
    this.dirty = true
  }

  // ---------------------------------------------------------------- quality

  /** Key-light shadow per tier. The shadow type stays fixed (changing it would recompile every material). */
  private applyShadows(st: ReturnType<typeof tierSettings>) {
    const key = (this.environment.userData.analysisState as { key?: THREE.SpotLight } | undefined)?.key
    if (!key) return
    const size = this.software ? Math.min(st.shadows.mapSize, 1024) : st.shadows.mapSize
    if (key.shadow.mapSize.x !== size) { key.shadow.mapSize.set(size, size); key.shadow.map?.dispose(); key.shadow.map = null }
    key.castShadow = st.shadows.enabled; this.tierShadows = st.shadows.enabled; this.shadowStride = st.shadows.stride
    this.renderer.shadowMap.needsUpdate = true; this.dirty = true
  }

  /** Apply every tier-dependent setting. Never touches frames, the simulation or basketball state. */
  private applyTier(tier: QualityTier, why: string, scale?: number) {
    const changed = tier !== this.tier
    this.tier = tier
    if (changed) this.tierAdjusted = true
    const st = tierSettings(tier)
    this.scale = Math.min(scale ?? this.scale, this.probe.devicePixelRatio, st.maxPixelRatio)
    this.scale = Math.max(Math.min(st.minScale, this.probe.devicePixelRatio), this.scale)
    this.renderer.setPixelRatio(this.scale); this.resize()
    configureWorldRenderer(this.renderer, tier === 'high' ? 'high' : 'low')
    for (const a of this.athletes.values()) setAthleteQuality(a, st.athlete)
    const setEnv = (Env as unknown as Record<string, unknown>).setEnvironmentQuality as undefined | ((env: THREE.Group, r: THREE.WebGLRenderer, t: QualityTier) => void)
    if (changed && typeof setEnv === 'function') { try { setEnv(this.environment, this.renderer, st.environment) } catch { /* environment keeps its build-time quality */ } }
    this.applyShadows(st)
    setMarkDetail(st.markDetail)
    if (this.ghost) {
      this.ghost.shafts.geometry.dispose(); this.ghost.shafts.geometry = new THREE.CylinderGeometry(1, 1, 1, st.ghost.radial)
      this.ghost.caps.geometry.dispose(); this.ghost.caps.geometry = new THREE.SphereGeometry(1, st.ghost.sphere[0], st.ghost.sphere[1])
    }
    this.controller.setTier(tier, this.scale, this.override !== 'auto')
    this.lastRenderAt = 0; this.lastXray = -1
    this.lastChange = { at: performance.now(), why: `${why} -> ${tier} ×${this.scale.toFixed(2)}` }
    this.callbacks.onTier?.(tier)
    this.dirty = true
  }

  /** User override ('auto' re-enables the controller). Persisted. */
  setQualityOverride(next: QualityOverride) {
    this.override = next; writeOverride(next)
    if (next === 'auto') { const t = chooseInitialTier(this.probe, 'auto'); this.tierReason = t.reason; this.applyTier(refineTier(t.tier, this.probe.warmupMs), 'auto') }
    else { this.tierReason = `override:${next}`; this.applyTier(next, 'override', tierSettings(next).maxPixelRatio) }
    this.controller.setTier(this.tier, this.scale, next !== 'auto')
  }
  getQualityOverride(): QualityOverride { return this.override }

  /** Start/stop a named measurement segment (used by ?bench and scripts/perf/bench.mjs). */
  beginSegment(name: string) { this.perf.begin(name) }
  endSegment(): SegmentSummary | null { return this.perf.end(this.counters(), this.tier, this.scale) }
  segments(): SegmentSummary[] { return this.perf.done }
  frameTotal() { return this.perf.total }
  /** Full device + tier description for the metrics JSON. */
  describe() { return { sceneReport: this.sceneReport(), probe: this.probe, tier: this.tier, tierReason: this.tierReason, override: this.override, scale: this.scale, lastChange: this.lastChange, settings: tierSettings(this.tier), software: this.software, nodraw: this.nodraw, canvas: { w: this.renderer.domElement.width, h: this.renderer.domElement.height } } }

  /**
   * Shader pre-warm. The first time a coach opens an X-Ray lens, every analytical mark material compiles its
   * program on the render thread (a visible hitch; seconds under software GL). One of each mark kind is built once
   * and kept (invisible) so the programs are compiled at start-up through compileAsync (KHR_parallel_shader_compile
   * where present) and stay cached. Costs no draw calls: the layer is hidden after compiling.
   */
  private warmShaders() {
    if (this.warm || this.nodraw || !this.state) return
    const ids = this.state.frame.players.map(p => p.id)
    if (ids.length < 2) return
    const [a, b] = ids, P = (x: number, z: number) => ({ x, z })
    try {
      const layer = new MarkLayer(this.scene); this.warm = layer
      const pts = [P(-2, 6), P(-1, 7), P(0, 8)]
      layer.update([
        { kind: 'ring', id: 'w-ring', at: a, tone: 'threat', pulse: true },
        { kind: 'path', id: 'w-path', points: pts, tone: 'attack', arrow: true },
        { kind: 'path', id: 'w-dash', points: pts, tone: 'warn', arrow: true, dashed: true },
        { kind: 'lane', id: 'w-lane', from: a, to: b, tone: 'good' },
        { kind: 'disc', id: 'w-disc', center: a, radius: 1, tone: 'defense', edge: true },
        { kind: 'tether', id: 'w-tether', from: a, to: b, tone: 'defense' },
        { kind: 'wedge', id: 'w-wedge', apex: a, toward: P(0, 1.575), length: 3, spread: 0.5, tone: 'threat' },
        { kind: 'arrival', id: 'w-arrival', sources: [b], accel: 5, maxSpeed: 6, react: 0.2, contest: 1, ballTime: 1 },
        { kind: 'pin', id: 'w-pin', at: a, tone: 'ghost' },
        { kind: 'comet', id: 'w-comet', points: pts, outcome: 'held' },
        { kind: 'flare', id: 'w-flare', at: a, tone: 'threat' },
      ], this.state.frame, performance.now(), 0, 1)
      const hide = () => { layer.root.visible = false; this.dirty = true }
      this.renderer.compileAsync(this.scene, this.camera).then(hide, hide)
    } catch { /* pre-warm is best-effort */ }
  }

  /** Static scene census for the perf report: where objects, triangles and materials live (visible objects only). */
  sceneReport() {
    const groups: Record<string, { objects: number; meshes: number; skinned: number; instanced: number; triangles: number; materials: number; matrixAutoUpdate: number }> = {}
    const mats = new Set<THREE.Material>()
    const label = (o: THREE.Object3D) => { let n: THREE.Object3D | null = o; while (n && n.parent && n.parent !== this.scene) n = n.parent; if (!n) return 'scene'; if (n === this.environment) return 'environment'; if (n === this.marks.root) return 'marks'; if (n === this.ghost.root) return 'ghost'; for (const a of this.athletes.values()) if (a.root === n) return 'athletes'; return 'other' }
    this.scene.traverseVisible(o => {
      const g = groups[label(o)] ??= { objects: 0, meshes: 0, skinned: 0, instanced: 0, triangles: 0, materials: 0, matrixAutoUpdate: 0 }
      g.objects++; if (o.matrixAutoUpdate) g.matrixAutoUpdate++
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      g.meshes++
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) g.skinned++
      const geo = m.geometry, tris = (geo.index ? geo.index.count : geo.getAttribute('position')?.count ?? 0) / 3
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1
      if ((m as THREE.InstancedMesh).isInstancedMesh) g.instanced++
      g.triangles += Math.round(tris * inst)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat)
    })
    for (const k of Object.keys(groups)) groups[k].materials = 0
    // GPU memory estimate: unique textures (with mip chain) + geometry attributes + shadow map + PMREM environment.
    const texs = new Set<THREE.Texture>(), geos = new Set<THREE.BufferGeometry>()
    for (const mat of mats) for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture)
    this.scene.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) geos.add(g) })
    const texBytes = (t: THREE.Texture) => { const im = t.image as { width?: number; height?: number } | undefined; return (im?.width ?? 0) * (im?.height ?? 0) * 4 * (t.generateMipmaps || t.minFilter >= THREE.NearestMipmapNearestFilter ? 1.34 : 1) }
    let textureBytes = 0; for (const t of texs) textureBytes += texBytes(t)
    let geometryBytes = 0; for (const g of geos) { for (const a of Object.values(g.attributes)) geometryBytes += (a as THREE.BufferAttribute).array.byteLength; if (g.index) geometryBytes += g.index.array.byteLength }
    const key = (this.environment.userData.analysisState as { key?: THREE.SpotLight } | undefined)?.key
    const shadowBytes = key?.shadow.map ? key.shadow.map.width * key.shadow.map.height * 4 : 0
    const envT = this.environment.userData.environmentTarget as THREE.WebGLRenderTarget | undefined
    const envBytes = envT ? envT.width * envT.height * 4 * 6 * 1.34 : 0
    const mb = (n: number) => Math.round(n / 1048576 * 10) / 10
    return { groups, uniqueMaterials: mats.size, uniqueTextures: texs.size, memoryMb: { textures: mb(textureBytes), geometry: mb(geometryBytes), shadowMap: mb(shadowBytes), environmentTarget: mb(envBytes) }, shadowCasters: (() => { let n = 0; this.scene.traverseVisible(o => { if ((o as THREE.Mesh).isMesh && o.castShadow) n++ }); return n })() }
  }

  private counters() {
    const i = this.renderer.info
    return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0, textures: i.memory.textures, geometries: i.memory.geometries }
  }

  private createGhost() {
    const gd = tierSettings(this.tier).ghost
    const ghost = createGhostWorld(gd.radial, gd.sphere)
    this.scene.add(ghost.root)
    return ghost
  }

  /** Views that sit at the post (baseline, behind-the-defense) take the stanchion, arm and pad out of the foreground. */
  private stanchion: THREE.Mesh[] = []
  private postHidden = false
  private setStanchionHidden(hidden: boolean) {
    if (hidden) {
      // Resolved fresh: authored basket assets stream in after the first frame.
      this.stanchion = []
      const box = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3()
      this.environment.updateMatrixWorld(true)
      this.environment.traverse(o => {
        const m = o as THREE.Mesh
        if (!m.isMesh || !m.visible) return
        box.setFromObject(m); box.getCenter(c); box.getSize(size)
        // Post and pad (low, behind the baseline) and the overhead arm (long and thin); never the board, rim or net.
        const post = Math.abs(c.x) < 0.7 && c.z > -1.7 && c.z < -0.1 && c.y < 3.6 && size.x < 2.2 && size.z < 3.2
        const arm = Math.abs(c.x) < 0.35 && size.x < 0.5 && size.z > 0.8 && size.z < 2.6 && c.y > 2.6 && c.y < 4.4 && c.z > -0.9 && c.z < 1.7
        if (post || arm) this.stanchion.push(m)
      })
      // The authored basket arrives as scene-level meshes (post, pad and arm).
      for (const o of this.scene.children) {
        const m = o as THREE.Mesh
        if (!m.isMesh || !m.visible || m.geometry.type === 'PlaneGeometry') continue
        box.setFromObject(m); box.getCenter(c); box.getSize(size)
        if (Math.abs(c.x) < 0.4 && c.z > -1.2 && c.z < 0.3 && size.y > 2.4 && size.x < 2.2) this.stanchion.push(m)
      }
      for (const m of this.stanchion) m.visible = false
    } else {
      for (const m of this.stanchion) m.visible = true
      this.stanchion = []
    }
    this.dirty = true
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
    this.viewW = Math.max(1, width); this.viewH = Math.max(1, height); this.controller.interrupt()
    this.camera.aspect = Math.max(1, width) / Math.max(1, height); this.viewKey = ''; this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  // ---------------------------------------------------------------- frame

  private tick = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    const began = performance.now()
    const s0 = this.state
    if (!s0) return
    // Playback clock lives outside React: read the exact frame for this animation frame.
    let s: WorldScene = s0
    if (this.view && s0.playing && s0.live) {
      this.view.frame = s0.live.frame(); if (s0.live.ghost) this.view.ghost = s0.live.ghost()
      if (this.tierShadows && ++this.shadowTick % this.shadowStride === 0) this.renderer.shadowMap.needsUpdate = true
      s = this.view
    }
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
    const W = this.viewW, H = this.viewH // cached from resize(): no layout read per frame
    const l = inset.left ?? 0, r = inset.right ?? 0, tp = inset.top ?? 0, b = inset.bottom ?? 0
    const ox = (r - l) / 2, oy = (b - tp) / 2
    const key = W + ':' + H + ':' + ox + ':' + oy
    if (key !== this.viewKey) {
      this.viewKey = key
      if (ox || oy) this.camera.setViewOffset(W, H, ox, oy, W, H); else this.camera.clearViewOffset()
      this.camera.updateProjectionMatrix()
      // Safe region expressed in the displayed NDC.
      this.director.safe = { x0: -1 + 2 * l / W, x1: 1 - 2 * r / W, y0: -1 + 2 * b / H, y1: 1 - 2 * tp / H }
      this.director.fitAspect = Math.max(0.5, (W - l - r)) / Math.max(1, H - tp - b)
      this.dirty = true
    }

    // Camera.
    const modeChanged = this.lastMode !== s.camera
    const nearPost = s.camera === 'baseline' || (s.camera === 'director' && (s.rig?.azimuth ?? 0) > 2.5)
    if (nearPost !== this.postHidden) { this.postHidden = nearPost; this.setStanchionHidden(nearPost) }
    if (modeChanged) {
      if (s.camera === 'free') this.controls.target.copy(this.director.target)
      else if (this.lastMode === 'free' || this.lastMode === null) this.director.adopt(this.lastMode === null ? this.director.target : this.controls.target)
      this.controls.enabled = s.camera !== 'player'
      this.lastMode = s.camera
    }
    if (s.camera === 'free') {
      if (this.controls.update()) animating = true
    } else if (!this.orbiting) {
      this.director.rig = s.rig ?? null
      if (this.director.step(s.camera, s.frame, s.focus, s.pov, dt, false)) { animating = true; this.dirty = true }
      this.controls.target.copy(this.director.target)
    } else this.controls.update()

    if (s.playing || this.drag) this.dirty = true
    const marksAnimate = this.marks.update(s.marks, s.frame, now, 1, this.xray)
    if (marksAnimate) { animating = true; this.dirty = true }
    if (!this.dirty && !animating) { this.lastRenderAt = 0; return }
    this.dirty = false

    this.applyFrame(s, now)
    // The analytical blend walks every tintable material and allocates colours: only when it changed.
    if (this.xray !== this.lastXray) { setLabEnvironmentAnalytical(this.environment, this.xray, 'porcelain'); this.lastXray = this.xray }
    updateEnvironmentForCamera(this.environment, this.camera)
    const timer = this.perf.gpu
    if (this.nodraw) this.scene.updateMatrixWorld() // ?nodraw: measure the JS pipeline without GPU work
    else { timer.begin(); this.renderer.render(this.scene, this.camera); timer.end() }
    this.writeLabels(s)
    timer.poll()
    this.record(now, performance.now() - began, s.playing || animating)
  }

  private applyFrame(s: WorldScene, now: number) {
    const frame = s.frame
    const highlight = s.highlight && s.highlight.length ? new Set(s.highlight) : null
    const blobs = this.contactShadows, dummy = this.shadowDummy
    if (blobs) { (blobs.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - this.xray * 0.6); dummy.rotation.set(-Math.PI / 2, 0, 0) }
    for (let pi = 0; pi < frame.players.length; pi++) {
      const p = frame.players[pi]
      const a = this.athletes.get(p.id); if (!a) continue
      a.root.position.set(p.x, p.pose.jump, p.z)
      // Full detail for the athletes the problem is about; the rest may use cheaper LOD.
      a.setFocus?.(s.focus.length ? s.focus.includes(p.id) || p.id === s.selectedId || frame.ball.owner === p.id : undefined)
      a.setPose({ time: frame.t, speed: Math.hypot(p.vx, p.vz), velocity: { x: p.vx, z: p.vz }, defensive: p.team === 'defense', pose: poseIntent(frame, p), phase: p.pose.phase, hands: p.pose.hands, ball: frame.ball, hasBall: frame.ball.owner === p.id && frame.ball.phase !== 'pass', facing: p.yaw })
      const hidden = s.camera === 'player' && p.id === s.pov
      a.figure.visible = !hidden
      const fade = highlight ? (highlight.has(p.id) ? 1 : 0) : 1
      for (const u of this.rims.get(p.id) ?? []) { u.uXray.value = this.xray; u.uFade.value = fade }
      if (blobs && pi < blobs.count) { dummy.position.set(p.x, 0.012, p.z); dummy.scale.setScalar(hidden ? 0 : 1); dummy.updateMatrix(); blobs.setMatrixAt(pi, dummy.matrix) }
    }
    if (blobs) blobs.instanceMatrix.needsUpdate = true
    this.ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z)
    this.ball.rotation.set(frame.t * 6, frame.t * 1.3, 0)
    this.ball.visible = frame.ball.phase !== 'dead' || true

    // Ghost world (hologram bodies for divergent defenders; see ghost.ts).
    this.ghost.update(frame, s.ghost ?? null, now)

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

  /** Label nodes are looked up once per DOM change (MutationObserver), not with querySelectorAll every frame. */
  private labelNodes: { node: HTMLElement; anchor: string; lift: number; pt: { x: number; z: number } | null; last: string }[] = []
  private labelsStale = true

  private refreshLabels(layer: HTMLElement) {
    if (!this.labelObserver) {
      this.labelObserver = new MutationObserver(() => { this.labelsStale = true; this.dirty = true })
      this.labelObserver.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-anchor', 'data-lift'] })
    }
    this.labelNodes = []
    layer.querySelectorAll<HTMLElement>('[data-anchor]').forEach(node => {
      const anchor = node.dataset.anchor!
      let pt: { x: number; z: number } | null = null
      if (anchor.startsWith('pt:')) { const [x, z] = anchor.slice(3).split(',').map(Number); pt = { x, z } }
      this.labelNodes.push({ node, anchor, lift: Number(node.dataset.lift ?? '0'), pt, last: '' })
    })
    this.labelsStale = false
  }

  private writeLabels(s: WorldScene) {
    const layer = this.labelLayer
    if (!layer) return
    if (this.labelsStale || !this.labelObserver) this.refreshLabels(layer)
    for (const L of this.labelNodes) {
      const node = L.node
      let pt: { x: number; z: number } | null = L.pt, y = L.lift
      if (!pt) {
        pt = resolveAnchor(s.frame, L.anchor as PlayerId)
        const p = s.frame.players.find(q => q.id === L.anchor)
        if (p) y = p.height + 0.28 + L.lift
      }
      if (!pt) { if (L.last !== 'hidden') { node.style.opacity = '0'; L.last = 'hidden' } continue }
      const pr = this.project(pt.x, y, pt.z)
      const t = 'translate3d(' + pr.x.toFixed(1) + 'px, ' + pr.y.toFixed(1) + 'px, 0)' + (pr.visible ? '' : '|0')
      if (t !== L.last) { // skip identical writes: no style invalidation for a still label
        L.last = t
        node.style.transform = t.endsWith('|0') ? t.slice(0, -2) : t
        node.style.opacity = pr.visible ? '' : '0'
      }
    }
  }

  /** Per rendered frame: record samples, feed the adaptive controller, emit ~1 Hz stats. */
  private record(now: number, jsMs: number, active: boolean) {
    let interval: number | null = this.lastRenderAt ? now - this.lastRenderAt : null
    this.lastRenderAt = now
    if (interval !== null && interval > 500) { interval = null; this.controller.interrupt() } // tab was hidden / stalled
    this.cpu = this.cpu * 0.9 + jsMs * 0.1
    const c = this.counters()
    this.perf.frame(interval, jsMs, c)
    this.frames++
    if (interval !== null && active && !this.nodraw) {
      const d = this.controller.push({ intervalMs: interval, jsMs, gpuMs: this.perf.gpu.p50() }, now, this.probe.devicePixelRatio)
      if (d?.kind === 'scale') { this.scale = d.scale; this.renderer.setPixelRatio(this.scale); this.lastChange = { at: now, why: `scale ${d.scale.toFixed(2)} (${d.why})` }; this.dirty = true }
      else if (d?.kind === 'tier') this.applyTier(d.tier, d.why, d.scale)
    } else if (!active) this.controller.interrupt()
    if (now - this.fpsAt > 1000) {
      this.fps = this.frames * 1000 / (now - this.fpsAt); this.frames = 0; this.fpsAt = now
      this.callbacks.onStats?.(this.stats())
    }
  }

  /** The debug-HUD contract: everything a coach, founder or script needs to read the world's health. */
  stats(): WorldStats {
    const c = this.counters(), iv = this.perf.intervals, js = this.perf.js
    return {
      fps: Math.round(this.fps), scale: this.scale, calls: c.calls, triangles: c.triangles, cpu: round(this.cpu, 1),
      frameP50: round(iv.percentile(0.5), 1), frameP95: round(iv.percentile(0.95), 1),
      jsMs: round(js.mean(), 1), jsP95: round(js.percentile(0.95), 1),
      gpuMs: this.perf.gpu.p50() === null ? null : round(this.perf.gpu.p50()!, 2),
      programs: c.programs, textures: c.textures, geometries: c.geometries,
      tier: this.tier, auto: this.override === 'auto', software: this.software,
      longTasks: this.perf.longTaskCount, change: this.lastChange?.why ?? null,
    }
  }
}


/** Athlete detail per tier. labAthlete.setQuality(‘balanced’) is feature-detected so an older
 * athlete module (high | low only) never ends up with both meshes hidden. */
let athleteBalanced: boolean | null = null
function setAthleteQuality(a: LabAthlete, q: QualityTier) {
  if (athleteBalanced === null) { const src = String(a.setQuality); athleteBalanced = /['"]balanced['"]/.test(src) }
  const set = a.setQuality as (q: string) => void
  set.call(a, q === 'balanced' && !athleteBalanced ? 'high' : q)
}

/** Throwaway context so the initial tier (and MSAA) is known before the real renderer exists. */
function probeEarly(): DeviceProbe {
  const canvas = document.createElement('canvas')
  const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
  const probe = probeDevice(gl)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return probe
}

function contactShadowTexture(size = 64) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const h = size / 2, ctx = canvas.getContext('2d')!, g = ctx.createRadialGradient(h, h, 0, h, h, h)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(canvas)
  // Alpha from luminance: draw as alphaMap on black.
  return t
}

/** Basketball intent for the animation layer, derived from the engine's own
 * responsibilities and ball state (never invented by the renderer). */
export function poseIntent(frame: import('@/lib/defense-lab/types').WorldFrame, p: PlayerState): string {
  const speed = Math.hypot(p.vx, p.vz)
  const fl = frame.ball.flight
  if (fl && fl.from === p.id && frame.t - fl.start < 0.3 && fl.kind !== 'shot') return fl.kind === 'skip' || fl.kind === 'lob' ? 'skip' : 'pass'
  if (p.team === 'defense') {
    // Highest-priority job (first wins on ties, as the stable sort did) without allocating per defender per frame.
    let job: (typeof frame.responsibilities)[number] | undefined
    for (const r of frame.responsibilities) if (r.defenderId === p.id && (!job || r.priority > job.priority)) job = r
    if (job?.kind === 'closeout' && speed > 0.6) return 'closeout'
    if (job?.kind === 'chase' && speed > 0.5) return 'fight'
    return p.pose.stance
  }
  if (p.pose.stance === 'run' && speed > 2.6) {
    // A sharp change of direction relative to facing reads as a plant-and-cut.
    const heading = Math.atan2(p.vx, p.vz), d = Math.atan2(Math.sin(heading - p.yaw), Math.cos(heading - p.yaw))
    if (Math.abs(d) > 0.9) return 'cut'
  }
  return p.pose.stance
}
