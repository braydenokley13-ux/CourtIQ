import { stressYielding } from './stressCore'
import type { StressOptions, StressReport } from './stressCore'
import type { LabConfig } from './types'
export { stress, stressSettings } from './stressCore'
export type { AssumptionSetting, StressSettingOutcome, StressRow, StressReport, StressOptions } from './stressCore'

function abortError() { return new DOMException('Stress analysis canceled.', 'AbortError') }

/** Worker cancellation terminates CPU work. Fallback yields between settings. */
export async function stressAsync(config: LabConfig, options: StressOptions = {}): Promise<StressReport> {
  if (options.signal?.aborted) throw abortError()
  if (typeof Worker === 'undefined') return stressYielding(config, options)
  let worker: Worker
  try { worker = new Worker(new URL('./stress.worker.ts', import.meta.url), { type: 'module' }) }
  catch { return stressYielding(config, options) }
  return new Promise<StressReport>((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()) }
    const cleanup = () => { worker.terminate(); options.signal?.removeEventListener('abort', abort) }
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ report?: StressReport; error?: string; progress?: number }>) => {
      if (event.data.progress !== undefined) { options.onProgress?.(event.data.progress); return }
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else if (event.data.report) { options.onProgress?.(1); resolve(event.data.report) }
      else reject(new Error('Stress worker returned no evidence.'))
    }
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Stress analysis worker failed.')) }
    worker.postMessage({ config, beforeConfig: options.beforeConfig })
  })
}
