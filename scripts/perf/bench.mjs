#!/usr/bin/env node
/**
 * CourtIQ performance benchmark (Playwright + Chromium).
 *
 *   node scripts/perf/bench.mjs                       # software GL (SwiftShader): JS/draw-call/memory numbers only
 *   node scripts/perf/bench.mjs --gpu                 # REAL GPU: headed Chrome, no software flags. Run this on a school laptop.
 *   node scripts/perf/bench.mjs --gpu --quality balanced --url https://your-preview.example.com
 *
 * Options
 *   --url <base>        app origin (default http://localhost:3000). Use a production build for real bundle sizes.
 *   --gpu               real GPU flags, headed. Without it: software GL, headless, FPS is NOT meaningful.
 *   --quality <t>       auto|high|balanced|low (default auto). Passed as ?quality=
 *   --nodraw            run the scenario with rendering disabled (JS pipeline only)
 *   --uiclock <ms>      React clock cadence during playback (default 80; 0 = update React every frame, the pre-fix behaviour)
 *   --soak <n>          repeat the possession n extra times and record heap + GPU resource counts (leak check)
 *   --width/--height    CSS viewport (default 1440x900 with --gpu, 840x472 otherwise)   --dpr <n>  deviceScaleFactor (default 1; use 2 to emulate a MacBook)
 *   --chrome <path>     browser binary (default /opt/pw-browsers/chromium if present, else Playwright's own)
 *   --trace             also record a Chrome trace and report GC count / bytes freed per segment (adds overhead)
 *   --label <s>         name for the output files      --out <dir>  (default docs/rendering/evidence)
 *   --timeout <sec>     whole-scenario timeout (default 900)
 *
 * Output: <out>/bench-<label>.json (full metrics) and .md (summary table). Exit code 0 = ran; see "verdict" in the JSON.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = n => argv.includes(`--${n}`)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }

const gpu = flag('gpu')
const base = opt('url', 'http://localhost:3000').replace(/\/$/, '')
const quality = opt('quality', 'auto')
const soak = Number(opt('soak', '0')) || 0
const width = Number(opt('width', gpu ? '1440' : '840')), height = Number(opt('height', gpu ? '900' : '472')), dpr = Number(opt('dpr', '1'))
const outDir = resolve(opt('out', resolve(here, '../../docs/rendering/evidence')))
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const label = opt('label', `${gpu ? 'gpu' : 'swiftshader'}-${quality}${flag('nodraw') ? '-nodraw' : ''}${opt('uiclock', null) !== null ? '-uiclock' + opt('uiclock') : ''}-${stamp}`)
const timeoutMs = Number(opt('timeout', '900')) * 1000
const chrome = opt('chrome', existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)

const common = ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
const args = gpu
  ? [...common, '--ignore-gpu-blocklist', '--enable-gpu-rasterization']          // real GPU, real vsync
  : [...common, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

const q = new URLSearchParams({ bench: '1' })
if (quality !== 'auto') q.set('quality', quality)
if (flag('nodraw')) q.set('nodraw', '1')
if (opt('uiclock', null) !== null) q.set('uiclock', opt('uiclock'))
if (soak) q.set('soak', String(soak))
const url = `${base}/?${q}`

console.log(`CourtIQ bench  ${gpu ? 'REAL GPU' : 'SOFTWARE GL (FPS not meaningful)'}  ${url}`)
const browser = await chromium.launch({ executablePath: chrome, headless: !gpu || flag('headless'), args })
let cleaned = false
const close = async () => { if (!cleaned) { cleaned = true; await browser.close().catch(() => {}) } }
process.on('SIGINT', async () => { await close(); process.exit(130) })
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr })
  const page = await context.newPage()
  page.on('pageerror', e => console.log('pageerror:', String(e.message).slice(0, 200)))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const snap = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); return Object.fromEntries(metrics.map(m => [m.name, m.value])) }
  const marks = {}
  await page.exposeFunction('__benchMark', async (name, ev) => { const m = await snap(); (marks[name] ??= {})[ev] = m })
  if (flag('trace')) await browser.startTracing(page, { categories: ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-v8.gc'] })

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })
  const loadMs = Date.now() - t0
  let lastStatus = ''
  const progress = setInterval(async () => { const st = await page.evaluate(() => window.__courtiqBenchStatus || '').catch(() => ''); if (st && st !== lastStatus) { lastStatus = st; console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${st}`) } }, 2000)
  try { await page.waitForFunction(() => window.__courtiqBench?.done === true, null, { timeout: timeoutMs, polling: 1000 }) } finally { clearInterval(progress) }
  const out = await page.evaluate(() => window.__courtiqBench)
  if (!out.result) throw new Error(out.error || 'scenario produced no result')
  const heap = await snap()

  let gcBySegment = null
  if (flag('trace')) {
    const buf = await browser.stopTracing()
    gcBySegment = analyzeTrace(JSON.parse(buf.toString()).traceEvents ?? [])
  }

  // Main-thread cost per frame from CDP deltas (total busy time, including React, layout, style, GC, runtime).
  const d = (a, b, k) => (b && a ? (b[k] - a[k]) * 1000 : null)
  for (const s of out.result.segments) {
    const m = marks[s.name]
    if (!m?.begin || !m?.end || !s.frames) continue
    const per = k => { const v = d(m.begin, m.end, k); return v === null ? null : Math.round(v / s.frames * 100) / 100 }
    s.mainThread = { busyMsPerFrame: per('TaskDuration'), scriptMsPerFrame: per('ScriptDuration'), layoutMsPerFrame: per('LayoutDuration'), styleMsPerFrame: per('RecalcStyleDuration'),
      busyPct: Math.round(d(m.begin, m.end, 'TaskDuration') / (s.seconds * 10) * 10) / 10,
      nonRuntimeJsMsPerFrame: per('ScriptDuration') === null ? null : Math.round((per('ScriptDuration') - s.jsMs.mean) * 100) / 100 }
    if (gcBySegment?.[s.name]) s.gc = gcBySegment[s.name]
  }
  const result = { ...out.result, loadMs, cdpFinal: { jsHeapUsedMb: Math.round(heap.JSHeapUsedSize / 1048576 * 10) / 10, nodes: heap.Nodes, listeners: heap.JSEventListeners }, bench: { gpuFlags: gpu, args, chrome: chrome ?? 'playwright default', label } }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, `bench-${label}.json`), JSON.stringify(result, null, 2))
  const md = summary(result)
  writeFileSync(resolve(outDir, `bench-${label}.md`), md)
  console.log('\n' + md)
  console.log(`\nWrote ${resolve(outDir, `bench-${label}.json`)}`)
} finally { await close() }

function analyzeTrace(events) {
  const bounds = {}
  for (const e of events) { const m = /^bench:(begin|end):(.+)$/.exec(e.name || ''); if (m && e.cat?.includes('blink.user_timing')) (bounds[m[2]] ??= {})[m[1]] = e.ts }
  const gcs = events.filter(e => /^(MinorGC|MajorGC)$/.test(e.name) && e.ph === 'X')
  const out = {}
  for (const [name, b] of Object.entries(bounds)) {
    if (!b.begin || !b.end) continue
    const inside = gcs.filter(e => e.ts >= b.begin && e.ts <= b.end)
    const freed = inside.reduce((s, e) => s + Math.max(0, (e.args?.usedHeapSizeBefore ?? 0) - (e.args?.usedHeapSizeAfter ?? 0)), 0)
    const secs = (b.end - b.begin) / 1e6
    out[name] = { minor: inside.filter(e => e.name === 'MinorGC').length, major: inside.filter(e => e.name === 'MajorGC').length, gcMs: Math.round(inside.reduce((s, e) => s + (e.dur || 0), 0) / 100) / 10, freedMbPerSec: Math.round(freed / 1048576 / Math.max(secs, 0.001) * 100) / 100 }
  }
  return out
}

function summary(r) {
  const v = r.verdict, p = r.device.probe
  const f = (x, n = 1) => x === null || x === undefined ? 'n/a' : Number(x).toFixed(n)
  const lines = []
  lines.push(`# CourtIQ perf run ${r.bench.label}`, '')
  lines.push(`- Verdict: **${!v.valid ? 'NOT A VALID FPS TEST' : v.pass ? 'PASS' : 'BELOW TARGET'}** — ${v.reason}; tier ${v.tier} (${r.device.tierReason}${r.device.override !== 'auto' ? ', user override' : ', auto'})`)
  lines.push(`- Device: ${p.renderer} | ${p.hardwareConcurrency} cores | ${p.deviceMemory ?? '?'} GB | dpr ${r.viewport.dpr} | canvas ${r.device.canvas.w}x${r.device.canvas.h} | GPU timer ${p.timerQuery ? 'yes' : 'no'} | warm-up ${p.warmupMs === null ? 'n/a' : f(p.warmupMs, 2) + ' ms (' + p.warmupMethod + ')'}`)
  lines.push(`- Page: ${r.url} | load ${r.loadMs} ms | js heap at end ${r.cdpFinal.jsHeapUsedMb} MB | DOM nodes ${r.cdpFinal.nodes}`, '')
  lines.push('| segment | frames | fps | frame p50 ms | p95 ms | p99 ms | js ms (p50/p95) | gpu ms p50 | main-thread busy ms/frame | non-runtime JS ms/frame | long tasks | calls | tris | scale |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const s of r.segments) lines.push(`| ${s.name} | ${s.frames} | ${f(s.fps)} | ${f(s.intervalMs.p50)} | ${f(s.intervalMs.p95)} | ${f(s.intervalMs.p99)} | ${f(s.jsMs.p50)} / ${f(s.jsMs.p95)} | ${s.gpuMs ? f(s.gpuMs.p50, 2) : 'n/a'} | ${f(s.mainThread?.busyMsPerFrame)} | ${f(s.mainThread?.nonRuntimeJsMsPerFrame)} | ${s.longTasks.count} (max ${f(s.longTasks.maxMs, 0)} ms) | ${s.counters.peakCalls} | ${Math.round(s.counters.peakTriangles / 1000)}k | ${f(s.scale, 2)} |`)
  lines.push('')
  const last = r.segments.at(-1)?.counters
  if (last) lines.push(`- Resources at end: ${last.programs} shader programs, ${last.textures} textures, ${last.geometries} geometries`)
  lines.push(`- Fix search (worker): ${r.workers.explore.map(w => `${w.ms} ms, UI timer lag p95 ${w.mainThreadLag.p95} / max ${w.mainThreadLag.max} ms`).join('; ') || 'n/a'}`)
  lines.push(`- Break search (worker): ${r.workers.attack.map(w => `${w.ms} ms, UI timer lag p95 ${w.mainThreadLag.p95} / max ${w.mainThreadLag.max} ms`).join('; ') || 'n/a'}`)
  const t = r.resources
  lines.push(`- Transferred: ${t.totalTransferKb} KB total; ` + Object.entries(t.byType).map(([k, b]) => `${k} ${b.transferKb} KB (${b.files})`).join(', '))
  if (r.soak.length) lines.push('', '| soak iteration | heap MB (after gc) | geometries | textures | programs |', '|---|---|---|---|---|', ...r.soak.map(s => `| ${s.iteration} | ${f(s.heapMb)} | ${s.geometries} | ${s.textures} | ${s.programs} |`))
  if (v.checks.length) lines.push('', 'Pass checks (p50 >= 45 fps, p95 interval < 33 ms): ' + v.checks.map(c => `${c.segment} ${c.pass ? 'ok' : 'FAIL'} (${c.fpsP50} fps, p95 ${c.p95Interval} ms)`).join('; '))
  return lines.join('\n')
}
