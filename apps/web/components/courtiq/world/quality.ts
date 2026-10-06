/**
 * Quality tiers for the world: HIGH / BALANCED / LOW-FALLBACK.
 *
 * Tiers change only how the world is *drawn* (resolution, shadows, mesh and texture
 * detail). They never touch the simulation, the frame data or any basketball number.
 *
 * Pieces here are free of three.js so they are unit-testable:
 *   - TIERS / tierSettings      the tier -> settings table (single source of truth)
 *   - probeDevice               synchronous capability probe (renderer string, cores, memory, DPR…)
 *   - gpuWarmup                 short GPU timing probe on a throwaway context (timer query when exposed)
 *   - chooseInitialTier         probe (+ override) -> starting tier
 *   - readOverride/writeOverride  localStorage + ?quality=
 *   - AdaptiveController        render scale first, then tier, with hysteresis, from real frame data
 *
 * Provisional thresholds (initial-tier heuristics, warm-up cut-offs, controller limits) are
 * NOT calibrated against real devices — see docs/rendering/performance-evidence.md.
 */

export type QualityTier = 'high' | 'balanced' | 'low'
export const TIERS: readonly QualityTier[] = ['high', 'balanced', 'low']
export type QualityOverride = QualityTier | 'auto'

export interface TierSettings {
  tier: QualityTier
  /** Upper bound for renderer pixel ratio (also bounded by devicePixelRatio). */
  maxPixelRatio: number
  /** Lowest pixel ratio the controller may drop to inside this tier. */
  minScale: number
  /** stride: re-render the shadow map every Nth rendered frame during playback (exact whenever paused). */
  shadows: { enabled: boolean; mapSize: number; stride: number }
  /** Passed to labAthlete.setQuality (mapped safely until 'balanced' exists there). */
  athlete: QualityTier
  /** Passed to setEnvironmentQuality when exported; otherwise only the build-time option applies. */
  environment: QualityTier
  /** Radial segment multiplier for analytical marks (rings, discs, ribbons). */
  markDetail: number
  /** Ghost capsule geometry detail: [cylinder radial segments, sphere width x height segments]. */
  ghost: { radial: number; sphere: [number, number] }
  /** MSAA at context creation (cannot change later; only the initial tier decides it). */
  antialias: boolean
  /** Contact shadow blob resolution (px). */
  contactShadowTex: number
}

const TABLE: Record<QualityTier, TierSettings> = {
  high: { tier: 'high', maxPixelRatio: 2, minScale: 0.85, shadows: { enabled: true, mapSize: 2048, stride: 1 }, athlete: 'high', environment: 'high', markDetail: 1, ghost: { radial: 10, sphere: [12, 8] }, antialias: true, contactShadowTex: 64 },
  balanced: { tier: 'balanced', maxPixelRatio: 1.25, minScale: 0.7, shadows: { enabled: true, mapSize: 1024, stride: 2 }, athlete: 'balanced', environment: 'balanced', markDetail: 0.75, ghost: { radial: 8, sphere: [10, 6] }, antialias: true, contactShadowTex: 64 },
  low: { tier: 'low', maxPixelRatio: 1, minScale: 0.55, shadows: { enabled: false, mapSize: 512, stride: 1 }, athlete: 'low', environment: 'low', markDetail: 0.5, ghost: { radial: 6, sphere: [8, 6] }, antialias: false, contactShadowTex: 32 },
}
export const tierSettings = (t: QualityTier): TierSettings => TABLE[t]
export const tierIndex = (t: QualityTier) => TIERS.indexOf(t)
export const isTier = (v: unknown): v is QualityTier => v === 'high' || v === 'balanced' || v === 'low'

// ------------------------------------------------------------------ probe

export interface DeviceProbe {
  renderer: string
  vendor: string
  software: boolean
  /** Heuristic from the renderer string; true for Intel iGPUs, mobile GPUs, etc. */
  integrated: boolean
  /** Apple Silicon / discrete-class GPU by renderer string. */
  strong: boolean
  mobile: boolean
  devicePixelRatio: number
  hardwareConcurrency: number
  /** navigator.deviceMemory (GB, capped at 8 by browsers), null if unsupported. */
  deviceMemory: number | null
  maxTextureSize: number
  reducedMotion: boolean
  timerQuery: boolean
  webgl2: boolean
  /** Filled by gpuWarmup(): ms for the fixed warm-up workload, null when not measured. */
  warmupMs: number | null
  warmupMethod: 'timer-query' | 'wall-clock' | null
}

export function classifyRenderer(renderer: string): Pick<DeviceProbe, 'software' | 'integrated' | 'strong'> {
  const r = renderer.toLowerCase()
  const software = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(r)
  const apple = /apple (m\d|gpu)/.test(r) || /metal renderer: apple/.test(r)
  const discrete = /nvidia|geforce|rtx|gtx|radeon (rx|pro|vii)|amd radeon (rx|pro)|quadro|arc\b/.test(r) && !/mx\d{3}/.test(r)
  const strong = !software && (apple || discrete)
  const integrated = !software && !strong && /intel|uhd|iris|hd graphics|mali|adreno|powervr|videocore|xclipse|vega \d|radeon graphics|llvmpipe/.test(r)
  return { software, integrated, strong }
}

export function probeDevice(gl: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceProbe {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator)
  let renderer = 'unknown', vendor = 'unknown', maxTex = 0, timerQuery = false, webgl2 = false
  if (gl) {
    webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    vendor = info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR))
    maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0
    timerQuery = webgl2 && !!gl.getExtension('EXT_disjoint_timer_query_webgl2')
  }
  const cls = classifyRenderer(renderer)
  const ua = nav.userAgent ?? ''
  return {
    renderer, vendor, ...cls, mobile: /android|iphone|ipad|mobile/i.test(ua) && !/cros/i.test(ua) ? true : false,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    hardwareConcurrency: nav.hardwareConcurrency ?? 4,
    deviceMemory: (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    maxTextureSize: maxTex,
    reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    timerQuery, webgl2, warmupMs: null, warmupMethod: null,
  }
}

/**
 * Fixed fragment-bound workload on a throwaway 512x512 context; returns elapsed GPU ms
 * (timer query when exposed, else wall clock around a synchronising readPixels).
 * Skipped (null) on software GL — it would just stall the main thread.
 */
export function gpuWarmup(probe: DeviceProbe): Promise<{ ms: number | null; method: DeviceProbe['warmupMethod'] }> {
  if (probe.software || typeof document === 'undefined') return Promise.resolve({ ms: null, method: null })
  return new Promise(resolve => {
    const done = (ms: number | null, method: DeviceProbe['warmupMethod']) => resolve({ ms, method })
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
      const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }) as WebGL2RenderingContext | null
      if (!gl) return done(null, null)
      const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
      const prog = gl.createProgram()!
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv=p*.5+.5; gl_Position=vec4(p,0.,1.); }'))
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform float k;\nvoid main(){ vec3 c=vec3(uv,k); for(int i=0;i<48;i++){ c=vec3(sin(c.y*3.1+c.z),cos(c.x*2.7-c.z),sin(c.x*c.y+1.3))*.5+.5; } o=vec4(c,1.); }'))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return done(null, null)
      gl.useProgram(prog)
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const k = gl.getUniformLocation(prog, 'k')
      const pass = (n: number) => { for (let i = 0; i < n; i++) { gl.uniform1f(k, i * 0.01); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4) } }
      const px = new Uint8Array(4)
      pass(2); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) // compile + warm
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
      const release = () => gl.getExtension('WEBGL_lose_context')?.loseContext()
      if (ext) {
        const q = gl.createQuery()!
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q); pass(12); gl.endQuery(ext.TIME_ELAPSED_EXT)
        const started = performance.now()
        const poll = () => {
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
            const ms = Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6
            release(); return disjoint ? done(null, null) : done(ms, 'timer-query')
          }
          if (performance.now() - started > 1500) { release(); return done(null, null) }
          setTimeout(poll, 8)
        }
        poll()
      } else {
        const t0 = performance.now(); pass(12); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const ms = performance.now() - t0; release(); done(ms, 'wall-clock')
      }
    } catch { done(null, null) }
  })
}

/** Provisional warm-up cut-offs (ms for the 12-pass workload). Calibrate on real devices. */
export const WARMUP_LIMITS = { fast: 1.5, slow: 9 }

export function chooseInitialTier(probe: DeviceProbe, override: QualityOverride = 'auto'): { tier: QualityTier; reason: string } {
  if (override !== 'auto') return { tier: override, reason: `override:${override}` }
  if (probe.software) return { tier: 'low', reason: 'software-gl' }
  const weakHost = probe.hardwareConcurrency <= 4 && probe.deviceMemory !== null && probe.deviceMemory <= 4
  let tier: QualityTier
  let reason: string
  if (probe.strong && !weakHost) { tier = 'high'; reason = 'strong-gpu' }
  else if (weakHost) { tier = 'low'; reason = 'chromebook-class (<=4 cores, <=4 GB)' }
  else if (probe.mobile) { tier = 'balanced'; reason = 'mobile' }
  else if (probe.integrated) { tier = 'balanced'; reason = 'integrated-gpu' }
  else { tier = 'balanced'; reason = 'unknown-gpu' }
  return { tier, reason }
}

/** Refine the heuristic with the measured warm-up: at most one step either way. */
export function refineTier(tier: QualityTier, warmupMs: number | null): QualityTier {
  if (warmupMs === null) return tier
  const i = tierIndex(tier)
  if (warmupMs > WARMUP_LIMITS.slow) return TIERS[Math.min(2, i + 1)]
  if (warmupMs < WARMUP_LIMITS.fast && tier === 'balanced') return 'high'
  return tier
}

// ------------------------------------------------------------------ override

const KEY = 'courtiq.quality'
export function readOverride(search = typeof window !== 'undefined' ? window.location.search : ''): QualityOverride {
  try {
    const q = new URLSearchParams(search).get('quality')
    if (q === 'auto') { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return 'auto' }
    if (isTier(q)) { writeOverride(q); return q }
  } catch { /* ignore */ }
  try { const v = localStorage.getItem(KEY); if (isTier(v)) return v } catch { /* ignore */ }
  return 'auto'
}
export function writeOverride(v: QualityOverride) {
  try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v) } catch { /* ignore */ }
}

// ------------------------------------------------------------------ controller

export interface ControllerSample { intervalMs: number; jsMs: number; gpuMs: number | null }
export type Decision =
  | { kind: 'scale'; scale: number; why: string }
  | { kind: 'tier'; tier: QualityTier; scale: number; why: string }
  | null

export const CONTROLLER = {
  evalEveryMs: 750, minSamples: 12, window: 90, cooldownMs: 1500,
  badP50: 21, badP95: 34, badGpu: 14,
  goodP50: 18.8, goodP95: 26, goodGpu: 9,
  cpuBoundJs: 9,
  badEvalsToDegrade: 2, goodEvalsToScaleUp: 8, goodEvalsToTierUp: 24,
  scaleDown: 0.15, scaleUp: 0.1,
  tierUpBlockMs: 90_000,
} as const

const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }

/**
 * Render scale first, then tier. Feed it one sample per *consecutive* rendered frame
 * (not idle gaps). Degrades after 2 bad windows; recovers slowly (8 good windows for
 * scale, 24 for a tier), and blocks tier-up after a failed attempt.
 */
export class AdaptiveController {
  tier: QualityTier
  scale: number
  private samples: ControllerSample[] = []
  private lastEval = 0
  private holdUntil = 0
  private bad = 0
  private good = 0
  private blockUpUntil = 0
  private upgraded = false
  private blockMultiplier = 1
  /** When locked (user override) only the render scale moves, never the tier. */
  locked: boolean
  constructor(tier: QualityTier, scale: number, locked = false) { this.tier = tier; this.scale = scale; this.locked = locked }

  setTier(tier: QualityTier, scale: number, locked: boolean) {
    this.tier = tier; this.scale = scale; this.locked = locked; this.reset()
  }
  private reset() { this.samples = []; this.bad = 0; this.good = 0 }
  /** Call when the page goes idle / hidden or the viewport resizes so stale samples are dropped. */
  interrupt() { this.reset() }

  private maxScale(deviceDpr: number) { return Math.min(deviceDpr, tierSettings(this.tier).maxPixelRatio) }

  push(s: ControllerSample, nowMs: number, deviceDpr: number): Decision {
    if (nowMs < this.holdUntil) return null
    this.samples.push(s); if (this.samples.length > CONTROLLER.window) this.samples.shift()
    if (!this.lastEval) this.lastEval = nowMs
    if (nowMs - this.lastEval < CONTROLLER.evalEveryMs || this.samples.length < CONTROLLER.minSamples) return null
    this.lastEval = nowMs
    const iv = this.samples.map(x => x.intervalMs), p50 = pct(iv, 0.5), p95 = pct(iv, 0.95)
    const js = pct(this.samples.map(x => x.jsMs), 0.5)
    const gpus = this.samples.map(x => x.gpuMs).filter((x): x is number => x !== null)
    const gpu = gpus.length >= 10 ? pct(gpus, 0.5) : null
    const isBad = p50 > CONTROLLER.badP50 || p95 > CONTROLLER.badP95 || (gpu !== null && gpu > CONTROLLER.badGpu)
    const isGood = p50 <= CONTROLLER.goodP50 && p95 <= CONTROLLER.goodP95 && (gpu === null || gpu <= CONTROLLER.goodGpu)
    const t = tierSettings(this.tier)
    const max = this.maxScale(deviceDpr), min = Math.min(t.minScale, max)
    this.samples = this.samples.slice(-Math.floor(CONTROLLER.minSamples / 2)) // overlap windows a little
    if (isBad) {
      this.good = 0; this.bad++
      if (this.bad < CONTROLLER.badEvalsToDegrade) return null
      this.bad = 0
      // A recently upgraded tier that immediately struggles: go back and block re-trying for a while.
      if (this.upgraded && !this.locked && this.tier !== 'low') {
        this.upgraded = false; this.blockMultiplier = Math.min(8, this.blockMultiplier * 2); this.blockUpUntil = nowMs + CONTROLLER.tierUpBlockMs * this.blockMultiplier
      }
      const cpuBound = js > CONTROLLER.cpuBoundJs
      const canScale = this.scale > min + 1e-6
      if (canScale && !(cpuBound && !this.locked && this.tier !== 'low' && this.scale <= max - 0.3)) {
        this.scale = Math.max(min, this.scale - CONTROLLER.scaleDown); this.hold(nowMs)
        return { kind: 'scale', scale: this.scale, why: `p50 ${p50.toFixed(1)} p95 ${p95.toFixed(1)}${gpu !== null ? ` gpu ${gpu.toFixed(1)}` : ''}` }
      }
      if (!this.locked && this.tier !== 'low') {
        const next = TIERS[tierIndex(this.tier) + 1]
        const nt = tierSettings(next)
        this.tier = next; this.scale = Math.min(this.maxScale(deviceDpr), Math.max(Math.min(nt.minScale, deviceDpr), this.scale + 0.25)); this.hold(nowMs)
        return { kind: 'tier', tier: next, scale: this.scale, why: `${cpuBound ? 'cpu-bound ' : 'scale floor '}p50 ${p50.toFixed(1)} p95 ${p95.toFixed(1)}` }
      }
      if (canScale) { this.scale = Math.max(min, this.scale - CONTROLLER.scaleDown); this.hold(nowMs); return { kind: 'scale', scale: this.scale, why: 'last resort' } }
      return null
    }
    this.bad = 0
    if (!isGood) { this.good = 0; return null }
    this.good++
    if (this.scale < max - 1e-6 && this.good >= CONTROLLER.goodEvalsToScaleUp) {
      this.good = 0; this.scale = Math.min(max, this.scale + CONTROLLER.scaleUp); this.hold(nowMs)
      return { kind: 'scale', scale: this.scale, why: 'headroom' }
    }
    if (!this.locked && this.scale >= max - 1e-6 && this.tier !== 'high' && this.good >= CONTROLLER.goodEvalsToTierUp && nowMs >= this.blockUpUntil) {
      const next = TIERS[tierIndex(this.tier) - 1]
      this.good = 0; this.tier = next; this.upgraded = true
      this.scale = Math.min(this.maxScale(deviceDpr), tierSettings(next).minScale + 0.15); this.hold(nowMs)
      return { kind: 'tier', tier: next, scale: this.scale, why: 'sustained headroom' }
    }
    return null
  }
  private hold(now: number) { this.holdUntil = now + CONTROLLER.cooldownMs; this.reset() }
}
