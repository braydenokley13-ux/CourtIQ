'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Lab } from './useLab'
import type { Lens } from './world/types'
import type { WorldRuntime } from './world/WorldRuntime'
import { LagProbe, round, type SegmentSummary } from './world/perf'

/**
 * ?bench — a fixed, reproducible scenario a coach or founder can open on a school laptop:
 *   entry → run → X-Ray lenses → fix + compare → Break search → Break replay (+ optional ?soak=N repeats).
 * Results are shown on screen and exposed as window.__courtiqBench for scripts/perf/bench.mjs.
 * ?bench&nodraw runs the same scenario without GPU work (JS pipeline only).
 */

export interface BenchResult {
  schema: 1
  when: string
  url: string
  userAgent: string
  viewport: { w: number; h: number; dpr: number }
  device: ReturnType<WorldRuntime['describe']>
  segments: SegmentSummary[]
  workers: { explore: { ms: number; mainThreadLag: LagStat }[]; attack: { ms: number; mainThreadLag: LagStat }[] }
  resources: ResourceSummary
  soak: { iteration: number; heapMb: number | null; geometries: number; textures: number; programs: number }[]
  verdict: { tier: string; valid: boolean; reason: string; checks: { segment: string; fpsP50: number; p95Interval: number; pass: boolean }[]; pass: boolean }
}
type LagStat = ReturnType<LagProbe['stop']>
interface ResourceSummary { totalTransferKb: number; byType: Record<string, { files: number; transferKb: number; decodedKb: number }>; largest: { name: string; transferKb: number }[] }

export interface BenchApi {
  lab: Lab
  runtime: MutableRefObject<WorldRuntime | null>
  enter(): void
  setLens(l: Lens): void
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const PLAY_SEGMENTS = /^(run-normal|xray-|compare-run|break-play)/

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = performance.now() + timeoutMs
  while (performance.now() < end) { if (cond()) return true; await sleep(40) }
  return cond()
}

function summarizeResources(): ResourceSummary {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const byType: ResourceSummary['byType'] = {}
  const kind = (n: string) => /\.(m?js)(\?|$)/.test(n) || /_next\/static\/chunks/.test(n) ? 'js' : /\.(glb|gltf)(\?|$)/.test(n) ? 'glb' : /\.(ktx2|png|jpe?g|webp|avif|hdr|exr)(\?|$)/.test(n) ? 'texture' : /\.css(\?|$)/.test(n) ? 'css' : /\.(woff2?|ttf)(\?|$)/.test(n) ? 'font' : 'other'
  let total = 0
  for (const e of entries) {
    const k = kind(e.name), t = (e.transferSize || e.encodedBodySize || 0) / 1024
    const b = byType[k] ??= { files: 0, transferKb: 0, decodedKb: 0 }
    b.files++; b.transferKb += t; b.decodedKb += (e.decodedBodySize || 0) / 1024; total += t
  }
  for (const b of Object.values(byType)) { b.transferKb = round(b.transferKb, 0); b.decodedKb = round(b.decodedKb, 0) }
  const largest = entries.map(e => ({ name: e.name.replace(/^https?:\/\/[^/]+/, '').slice(-80), transferKb: round((e.transferSize || e.encodedBodySize || 0) / 1024, 0) })).sort((a, b) => b.transferKb - a.transferKb).slice(0, 10)
  return { totalTransferKb: round(total, 0), byType, largest }
}

/** Pass criteria (docs/rendering/performance-evidence.md): p50 >= 45 fps and p95 frame interval < 33 ms on playback segments. */
function judge(segments: SegmentSummary[], tier: string, software: boolean, nodraw: boolean): BenchResult['verdict'] {
  const checks = segments.filter(s => PLAY_SEGMENTS.test(s.name) && s.intervalMs.p50 > 0).map(s => {
    const fpsP50 = round(1000 / s.intervalMs.p50, 1)
    return { segment: s.name, fpsP50, p95Interval: s.intervalMs.p95, pass: fpsP50 >= 45 && s.intervalMs.p95 < 33 }
  })
  const valid = !software && !nodraw
  return { tier, valid, reason: valid ? 'real GPU run' : nodraw ? 'nodraw: JS pipeline only, FPS not meaningful' : 'software GL: FPS not meaningful, JS/counters only', checks, pass: valid && checks.length > 0 && checks.every(c => c.pass) }
}

export function useBench(enabled: boolean, api: BenchApi) {
  const apiRef = useRef(api); apiRef.current = api
  const [status, setStatusRaw] = useState('waiting for the world…')
  const setStatus = (m: string) => { (window as unknown as { __courtiqBenchStatus?: string }).__courtiqBenchStatus = m; setStatusRaw(m) }
  const [result, setResult] = useState<BenchResult | null>(null)
  const started = useRef(false)
  const workers = useRef<BenchResult['workers']>({ explore: [], attack: [] })
  const lag = useRef(new LagProbe(10))
  const exploreAt = useRef(0)
  const attackAt = useRef(0)

  // Worker latency observers: wall time from "busy" to done, plus main-thread lag meanwhile.
  const { exploreBusy, phase } = api.lab
  useEffect(() => {
    if (!enabled) return
    if (exploreBusy) { exploreAt.current = performance.now(); lag.current.start() }
    else if (exploreAt.current) { const l = lag.current.stop(); workers.current.explore.push({ ms: round(performance.now() - exploreAt.current, 0), mainThreadLag: l }); exploreAt.current = 0 }
  }, [exploreBusy, enabled])
  const attackProbe = useRef(new LagProbe(10))
  useEffect(() => {
    if (!enabled) return
    if (phase === 'break-search') { attackAt.current = performance.now(); attackProbe.current.start() }
    else if (attackAt.current) { const l = attackProbe.current.stop(); workers.current.attack.push({ ms: round(performance.now() - attackAt.current, 0), mainThreadLag: l }); attackAt.current = 0 }
  }, [phase, enabled])

  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    const q = new URLSearchParams(window.location.search)
    const soak = Math.min(50, Math.max(0, Number(q.get('soak') ?? '0') || 0))
    const A = () => apiRef.current, L = () => apiRef.current.lab, rt = () => apiRef.current.runtime.current
    const mark = (name: string, ev: 'begin' | 'end') => { try { performance.mark(`bench:${ev}:${name}`); (window as unknown as { __benchMark?: (n: string, e: string) => void }).__benchMark?.(name, ev) } catch { /* ignore */ } }
    const seg = async (name: string, body: () => Promise<unknown>) => {
      setStatus(`measuring ${name}…`); mark(name, 'begin'); rt()?.beginSegment(name)
      await body()
      rt()?.endSegment(); mark(name, 'end')
    }
    const playOnce = async (name: string, from: number, until: number | null) => {
      L().play(from, until)
      await waitFor(() => L().playing, 5000)
      await seg(name, () => waitFor(() => !L().playing, 120000))
    }
    void (async () => {
      const g = window as unknown as { __courtiqBench?: { done: boolean; result: BenchResult | null; error?: string } }
      g.__courtiqBench = { done: false, result: null }
      try {
        if (!(await waitFor(() => !!rt(), 180000))) throw new Error('world never started (WebGL unavailable?)')
        // Software GL queues a lot of GPU work at start-up: wait until frames actually flow, then let GLBs settle.
        await waitFor(() => (rt()?.frameTotal() ?? 0) >= 30, 240000)
        await sleep(2000)
        await seg('entry-ambient', () => sleep(4000))

        setStatus('entering the lab and running the possession…')
        A().enter()
        await waitFor(() => L().playing, 20000)
        await seg('run-normal', () => waitFor(() => !L().playing, 120000))

        for (const lens of ['ownership', 'reach', 'passing', 'space'] as Lens[]) {
          A().setLens(lens); await sleep(900)
          await playOnce(`xray-${lens}`, 0, 3)
        }
        A().setLens('normal'); await sleep(300)

        setStatus('waiting for the fix search (worker)…')
        await waitFor(() => !!L().explore?.fixes.length, 90000)
        const fix = L().explore?.fixes[0]
        if (fix) {
          L().setPhase('fix'); await sleep(400)
          L().applyFix(fix)
          await waitFor(() => L().playing, 20000)
          await seg('compare-run', () => waitFor(() => !L().playing, 120000))
        }

        setStatus('breaking the defense (worker search)…')
        mark('break-search', 'begin'); rt()?.beginSegment('break-search')
        L().breakDefense()
        await sleep(200)
        await waitFor(() => L().phase !== 'break-search', 180000)
        rt()?.endSegment(); mark('break-search', 'end')
        if (L().phase === 'break-play') {
          await waitFor(() => L().playing, 5000)
          await seg('break-play', () => waitFor(() => !L().playing, 120000))
        }
        await sleep(500)

        const soakRows: BenchResult['soak'] = []
        for (let i = 1; i <= soak; i++) {
          setStatus(`soak ${i}/${soak}…`)
          await playOnce(`soak-${i}`, 0, null)
          ;(window as unknown as { gc?: () => void }).gc?.()
          await sleep(200)
          const st = rt()!.stats()
          const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          soakRows.push({ iteration: i, heapMb: heap ? round(heap.usedJSHeapSize / 1048576, 1) : null, geometries: st.geometries, textures: st.textures, programs: st.programs })
        }

        const runtime = rt()!, dev = runtime.describe(), segments = runtime.segments()
        const res: BenchResult = {
          schema: 1, when: new Date().toISOString(), url: window.location.href, userAgent: navigator.userAgent,
          viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
          device: dev, segments, workers: workers.current, resources: summarizeResources(), soak: soakRows,
          verdict: judge(segments, dev.tier, dev.software, dev.nodraw),
        }
        g.__courtiqBench = { done: true, result: res }
        setResult(res); setStatus('done')
      } catch (e) {
        g.__courtiqBench = { done: true, result: null, error: String(e) }
        setStatus(`failed: ${String(e)}`)
      }
    })()
  }, [enabled])

  return { status, result }
}

const th: React.CSSProperties = { textAlign: 'right', padding: '2px 8px', fontWeight: 600, color: '#9fb0bf' }
const td: React.CSSProperties = { textAlign: 'right', padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }

export function BenchOverlay({ status, result }: { status: string; result: BenchResult | null }) {
  const [copied, setCopied] = useState(false)
  const json = result ? JSON.stringify(result, null, 2) : ''
  const v = result?.verdict
  return (
    <div style={{ position: 'absolute', zIndex: 80, top: 56, right: 12, width: 'min(560px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 80px)', overflow: 'auto', background: 'rgba(8,12,17,.94)', color: '#e6edf3', border: '1px solid #2a3642', borderRadius: 10, padding: 14, font: '500 12px system-ui, sans-serif', pointerEvents: 'auto' }}>
      <div style={{ font: '700 14px system-ui', marginBottom: 6 }}>CourtIQ performance check</div>
      <div style={{ color: '#9fb0bf', marginBottom: 8 }}>{result ? 'Finished.' : 'Running a fixed scenario. Please do not touch the page.'} {status}</div>
      {result && v && <>
        <div style={{ margin: '6px 0 10px', padding: '6px 10px', borderRadius: 8, background: !v.valid ? '#3a2f12' : v.pass ? '#103a26' : '#3a1618' }}>
          <b>{!v.valid ? 'NOT A VALID FPS TEST' : v.pass ? 'PASS' : 'BELOW TARGET'}</b> — tier {v.tier}; {v.reason}. Target: p50 at least 45 fps and p95 frame interval under 33 ms.
        </div>
        <div style={{ color: '#9fb0bf', marginBottom: 6 }}>{result.device.probe.renderer} · {result.device.probe.hardwareConcurrency} cores · {result.device.probe.deviceMemory ?? '?'} GB · dpr {result.viewport.dpr} · canvas {result.device.canvas.w}×{result.device.canvas.h} · GPU timer {result.device.probe.timerQuery ? 'yes' : 'no'}{result.device.probe.warmupMs !== null ? ` · warm-up ${round(result.device.probe.warmupMs, 1)} ms` : ''}</div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>segment</th><th style={th}>fps</th><th style={th}>p50 ms</th><th style={th}>p95 ms</th><th style={th}>js ms</th><th style={th}>gpu ms</th><th style={th}>long</th></tr></thead>
          <tbody>{result.segments.map(s => (
            <tr key={s.name}><td style={{ ...td, textAlign: 'left' }}>{s.name}</td><td style={td}>{s.fps}</td><td style={td}>{s.intervalMs.p50}</td><td style={td}>{s.intervalMs.p95}</td><td style={td}>{s.jsMs.p50}</td><td style={td}>{s.gpuMs ? s.gpuMs.p50 : 'n/a'}</td><td style={td}>{s.longTasks.count}</td></tr>
          ))}</tbody>
        </table>
        <div style={{ marginTop: 8, color: '#9fb0bf' }}>
          Fix search: {result.workers.explore.map(w => `${w.ms} ms (UI lag p95 ${w.mainThreadLag.p95} ms)`).join(', ') || 'n/a'} · Break search: {result.workers.attack.map(w => `${w.ms} ms (UI lag p95 ${w.mainThreadLag.p95} ms)`).join(', ') || 'n/a'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => { void navigator.clipboard?.writeText(json).then(() => setCopied(true)) }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #3a4856', background: '#16202a', color: 'inherit', cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy results (JSON)'}</button>
          <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `courtiq-perf-${Date.now()}.json`; a.click() }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #3a4856', background: '#16202a', color: 'inherit', cursor: 'pointer' }}>Download</button>
        </div>
      </>}
    </div>
  )
}

