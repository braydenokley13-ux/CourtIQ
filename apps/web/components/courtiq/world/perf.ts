/**
 * Performance instrumentation for the world: ring buffers with percentiles, a
 * GPU timer-query wrapper (EXT_disjoint_timer_query_webgl2, when exposed), long-task
 * observation, and named measurement segments used by the ?bench scenario.
 *
 * Nothing here changes rendering; it only observes. All numbers are real
 * measurements of the running page. GPU numbers exist only when the browser
 * exposes the timer-query extension (many do not; software GL never does).
 */

export class Ring {
  private buf: Float64Array
  private n = 0
  private i = 0
  constructor(readonly capacity = 240) { this.buf = new Float64Array(capacity) }
  push(v: number) { this.buf[this.i] = v; this.i = (this.i + 1) % this.capacity; if (this.n < this.capacity) this.n++ }
  get length() { return this.n }
  clear() { this.n = 0; this.i = 0 }
  values(): number[] { return Array.from(this.buf.subarray(0, this.n)) }
  percentile(p: number): number { return percentile(this.values(), p) }
  mean(): number { if (!this.n) return 0; let s = 0; for (let k = 0; k < this.n; k++) s += this.buf[k]; return s / this.n }
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const idx = (s.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

/** Wraps EXT_disjoint_timer_query_webgl2 around the main render call. */
export class GpuTimer {
  readonly available: boolean
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null
  private pending: WebGLQuery[] = []
  private active: WebGLQuery | null = null
  readonly ring = new Ring(120)
  constructor(private gl: WebGL2RenderingContext | WebGLRenderingContext) {
    const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    const ext = isGl2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null
    this.ext = ext as typeof this.ext
    this.available = !!ext
  }
  begin() {
    if (!this.ext || this.active || this.pending.length > 6) return
    const gl = this.gl as WebGL2RenderingContext
    const q = gl.createQuery(); if (!q) return
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.active = q
  }
  end() {
    if (!this.ext || !this.active) return
    const gl = this.gl as WebGL2RenderingContext
    gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = null
  }
  /** Collect finished queries (non-blocking). */
  poll() {
    if (!this.ext) return
    const gl = this.gl as WebGL2RenderingContext
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean
    while (this.pending.length) {
      const q = this.pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      this.pending.shift()
      if (!disjoint) this.ring.push(Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6)
      gl.deleteQuery(q)
    }
    if (disjoint) { for (const q of this.pending) gl.deleteQuery(q); this.pending = [] }
  }
  /** Median GPU ms of recent frames, or null when unavailable / no sample yet. */
  p50(): number | null { return this.available && this.ring.length ? this.ring.percentile(0.5) : null }
  p95(): number | null { return this.available && this.ring.length ? this.ring.percentile(0.95) : null }
}

export interface RenderCounters { calls: number; triangles: number; programs: number; textures: number; geometries: number }

export interface SegmentSummary {
  name: string
  seconds: number
  frames: number
  fps: number
  intervalMs: { p50: number; p95: number; p99: number; max: number }
  jsMs: { p50: number; p95: number; max: number; mean: number }
  gpuMs: { p50: number; p95: number } | null
  longTasks: { count: number; totalMs: number; maxMs: number }
  counters: RenderCounters & { peakCalls: number; peakTriangles: number }
  tier: string
  scale: number
  heapMb: { start: number | null; end: number | null }
  jsHeapGrowthMbPerMin: number | null
}

interface OpenSegment {
  name: string; start: number; intervals: number[]; js: number[]; gpu: number[]; lt: { count: number; total: number; max: number }
  heapStart: number | null; peakCalls: number; peakTris: number; ticks: number
}

const heapMb = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? m.usedJSHeapSize / 1048576 : null
}

/** Records per-frame samples into the currently open segment. */
export class PerfRecorder {
  readonly intervals = new Ring(240)
  readonly js = new Ring(240)
  readonly gpu: GpuTimer
  private seg: OpenSegment | null = null
  readonly done: SegmentSummary[] = []
  private ltObs: PerformanceObserver | null = null
  longTaskCount = 0
  constructor(gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.gpu = new GpuTimer(gl)
    try {
      this.ltObs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          this.longTaskCount++
          if (this.seg) { this.seg.lt.count++; this.seg.lt.total += e.duration; this.seg.lt.max = Math.max(this.seg.lt.max, e.duration) }
        }
      })
      this.ltObs.observe({ entryTypes: ['longtask'] })
    } catch { this.ltObs = null }
  }
  /** One rendered frame. interval = ms since the previous *rendered* frame (null on the first / after idle). */
  frame(interval: number | null, jsMs: number, c: RenderCounters) {
    this.js.push(jsMs)
    if (interval !== null) this.intervals.push(interval)
    const g = this.gpu.p50()
    const s = this.seg
    if (s) {
      s.ticks++
      if (interval !== null) s.intervals.push(interval)
      s.js.push(jsMs)
      const last = this.gpu.ring.length ? this.gpu.ring.values().at(-1)! : null
      if (last !== null && g !== null) s.gpu.push(last)
      s.peakCalls = Math.max(s.peakCalls, c.calls); s.peakTris = Math.max(s.peakTris, c.triangles)
    }
  }
  begin(name: string) {
    this.seg = { name, start: performance.now(), intervals: [], js: [], gpu: [], lt: { count: 0, total: 0, max: 0 }, heapStart: heapMb(), peakCalls: 0, peakTris: 0, ticks: 0 }
  }
  end(counters: RenderCounters, tier: string, scale: number): SegmentSummary | null {
    const s = this.seg; this.seg = null
    if (!s) return null
    const seconds = (performance.now() - s.start) / 1000
    const heapEnd = heapMb()
    const active = s.intervals.reduce((a, b) => a + b, 0) / 1000
    const sum: SegmentSummary = {
      name: s.name, seconds: round(seconds, 2), frames: s.ticks,
      fps: round(active > 0 ? s.intervals.length / active : 0, 1),
      intervalMs: { p50: round(percentile(s.intervals, 0.5), 2), p95: round(percentile(s.intervals, 0.95), 2), p99: round(percentile(s.intervals, 0.99), 2), max: round(Math.max(0, ...s.intervals), 2) },
      jsMs: { p50: round(percentile(s.js, 0.5), 2), p95: round(percentile(s.js, 0.95), 2), max: round(Math.max(0, ...s.js), 2), mean: round(s.js.length ? s.js.reduce((a, b) => a + b, 0) / s.js.length : 0, 2) },
      gpuMs: s.gpu.length ? { p50: round(percentile(s.gpu, 0.5), 2), p95: round(percentile(s.gpu, 0.95), 2) } : null,
      longTasks: { count: s.lt.count, totalMs: round(s.lt.total, 1), maxMs: round(s.lt.max, 1) },
      counters: { ...counters, peakCalls: s.peakCalls, peakTriangles: s.peakTris },
      tier, scale: round(scale, 2),
      heapMb: { start: s.heapStart === null ? null : round(s.heapStart, 1), end: heapEnd === null ? null : round(heapEnd, 1) },
      jsHeapGrowthMbPerMin: s.heapStart !== null && heapEnd !== null && seconds > 1 ? round((heapEnd - s.heapStart) / seconds * 60, 2) : null,
    }
    this.done.push(sum)
    return sum
  }
  dispose() { this.ltObs?.disconnect() }
}

export const round = (v: number, d = 1) => { const k = 10 ** d; return Math.round(v * k) / k }

/** Event-loop responsiveness probe: how late a 10 ms timer fires. Shows whether workers (or anything else)
 * block the main thread while a search runs. */
export class LagProbe {
  private samples: number[] = []
  private timer = 0
  private expected = 0
  constructor(private periodMs = 10) {}
  start() {
    this.samples = []
    this.expected = performance.now() + this.periodMs
    const step = () => {
      const now = performance.now()
      this.samples.push(Math.max(0, now - this.expected))
      this.expected = now + this.periodMs
      this.timer = window.setTimeout(step, this.periodMs)
    }
    this.timer = window.setTimeout(step, this.periodMs)
  }
  stop(): { samples: number; p50: number; p95: number; max: number; over50ms: number } {
    window.clearTimeout(this.timer)
    const s = this.samples
    return { samples: s.length, p50: round(percentile(s, 0.5), 1), p95: round(percentile(s, 0.95), 1), max: round(Math.max(0, ...s), 1), over50ms: s.filter(v => v > 50).length }
  }
}
