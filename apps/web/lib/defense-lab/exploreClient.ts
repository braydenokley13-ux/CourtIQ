import { explore, robustness } from './explore'
import type { ExploreReport, Robustness, TeachingMoment } from './explore'
import type { LabConfig } from './types'
export { explore, findTeachingMoment, framingAt, proposeFixes, divergence, replayFix, playerWindows, robustness } from './explore'
export type { ExploreReport, FixOption, TeachingMoment, Divergence, Robustness } from './explore'

export interface ExploreOptions { signal?: AbortSignal; max?: number; /** false returns no frames; use replayFix(config, fix) for the chosen option. Default true. */ withFrames?: boolean }
const abortError = () => new DOMException('Explore canceled.', 'AbortError')

/** Baseline, teaching moment and every fix replay, computed off the main thread.
 * The report carries full frames (playback needs them), roughly 1.3 MB per replay
 * through structured clone, unless withFrames is false. Falls back to a main-thread run when no Worker exists. */
export async function exploreAsync(config: LabConfig, options: ExploreOptions = {}): Promise<ExploreReport> {
  if (options.signal?.aborted) throw abortError()
  if (typeof Worker === 'undefined') return explore(config, { max: options.max, withFrames: options.withFrames })
  let worker: Worker
  try { worker = new Worker(new URL('./explore.worker.ts', import.meta.url), { type: 'module' }) }
  catch { return explore(config, { max: options.max, withFrames: options.withFrames }) }
  return new Promise<ExploreReport>((resolve, reject) => {
    let settled = false
    const cleanup = () => { settled = true; worker.terminate(); options.signal?.removeEventListener('abort', abort) }
    const abort = () => { if (settled) return; cleanup(); reject(abortError()) }
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ report?: ExploreReport; error?: string }>) => {
      if (settled) return
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else if (event.data.report) resolve(event.data.report)
      else reject(new Error('Explore worker returned no evidence.'))
    }
    worker.onerror = event => { if (settled) return; cleanup(); reject(new Error(event.message || 'Explore worker failed.')) }
    worker.postMessage({ config, max: options.max, withFrames: options.withFrames })
  })
}

/** The deterministic jitter ensemble, off the main thread (about 0.1 s per sample on a loaded laptop). */
export async function robustnessAsync(config: LabConfig, options: { signal?: AbortSignal; samples?: number; moment?: TeachingMoment | null } = {}): Promise<Robustness> {
  if (options.signal?.aborted) throw abortError()
  if (typeof Worker === 'undefined') return robustness(config, { samples: options.samples, moment: options.moment })
  let worker: Worker
  try { worker = new Worker(new URL('./explore.worker.ts', import.meta.url), { type: 'module' }) }
  catch { return robustness(config, { samples: options.samples, moment: options.moment }) }
  return new Promise<Robustness>((resolve, reject) => {
    let settled = false
    const cleanup = () => { settled = true; worker.terminate(); options.signal?.removeEventListener('abort', abort) }
    const abort = () => { if (settled) return; cleanup(); reject(abortError()) }
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ robustness?: Robustness; error?: string }>) => {
      if (settled) return
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else if (event.data.robustness) resolve(event.data.robustness)
      else reject(new Error('Explore worker returned no robustness.'))
    }
    worker.onerror = event => { if (settled) return; cleanup(); reject(new Error(event.message || 'Explore worker failed.')) }
    worker.postMessage({ kind: 'robustness', config, samples: options.samples, moment: options.moment })
  })
}
