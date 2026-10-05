/** Reproducible CPU/replay harness. It measures this executor, never GPU or a
 * coach's device. Run with pnpm exec tsx scripts/profile-defense-lab.ts. */
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { analyze, compare } from '../apps/web/lib/defense-lab/analytics'
import { attack } from '../apps/web/lib/defense-lab/attackCore'
import { clearReplayCache, replayCacheStats, simulateCached } from '../apps/web/lib/defense-lab/replayCache'
import { createDefaultConfig } from '../apps/web/lib/defense-lab/scenario'
import { frameAt, simulate } from '../apps/web/lib/defense-lab/simulation'

function measure(name: string, count: number, fn: () => unknown, warmups = 3) {
  for (let i = 0; i < warmups; i++) fn()
  const times: number[] = []
  for (let i = 0; i < count; i++) { const start = performance.now(); fn(); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  return { name, samples: count, medianMs: +times[Math.floor(count / 2)].toFixed(4), p95Ms: +times[Math.min(count - 1, Math.ceil(count * 0.95) - 1)].toFixed(4) }
}

const config = createDefaultConfig(), run = simulate(config)
const shallow = { ...config, interventions: [{ id: 'shallow-at-tag', kind: 'answer' as const, at: 0.75, patch: { tagDepth: 0.25 } }] }
const pair = compare(run, simulate(shallow))
const report = attack(config, { budget: 28 })
const measurements = [
  measure('simulate-default-233-frames', 30, () => simulate(config)),
  measure('analyze-full-flight', 30, () => analyze(run)),
  measure('frameAt-interpolation', 1000, () => frameAt(run, 2.187)),
  measure('structuredClone-replay', 30, () => structuredClone(run)),
  measure('bounded-search-28', 5, () => attack(config, { budget: 28 }), 1),
  measure('cached-exact-replay', 1000, () => simulateCached(config)),
]
const cacheStats = replayCacheStats()
clearReplayCache()
console.log(JSON.stringify({
  recordedAt: new Date().toISOString(), environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform, architecture: process.arch, note: 'Managed cloud CPU; not a normal-laptop or GPU certification.' },
  measurements, replay: { frameCount: run.frames.length, serializedBytes: Buffer.byteLength(JSON.stringify(run)), motionHz: 1 / config.assumptions.dt, playerCount: run.frames[0].players.length, flightProbeMs: 5 },
  searchBudget: report.budget, retainedCache: cacheStats, deepReads: run.decisions.map(decision => decision.selected),
  shallowReads: simulate(shallow).decisions.map(decision => decision.selected),
  measuredTradeoffs: pair.tradeoffs.filter(change => change.id === 'lift' || change.id === 'roll'),
}, null, 2))
