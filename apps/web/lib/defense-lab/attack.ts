import { attackYielding } from './attackCore'
import type { AttackOptions, AttackPreview, AttackReport } from './attackCore'
import type { LabConfig } from './types'
export { attack, ATTACK_DOMAIN, findAttackWitness, compareAttackCandidates, attackIntentLabel, previewAttackCandidate, attackExecutionUnresolved } from './attackCore'
export type { AttackOptions, AttackPreview, AttackReport, AttackCandidate, AttackCandidateSummary, AttackWitness, AttackChange } from './attackCore'

const abortError = () => new DOMException('Attack canceled.', 'AbortError')
/** A dedicated worker per request prevents stale messages crossing requests. */
export async function attackAsync(config: LabConfig, options: AttackOptions = {}): Promise<AttackReport> {
  if (options.signal?.aborted) throw abortError()
  if (typeof Worker === 'undefined') return attackYielding(config, options)
  let worker: Worker
  try { worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' }) }
  catch { return attackYielding(config, options) }
  return new Promise<AttackReport>((resolve, reject) => {
    let settled = false
    const cleanup = () => { settled = true; worker.terminate(); options.signal?.removeEventListener('abort', abort) }
    const abort = () => { if (settled) return; cleanup(); reject(abortError()) }
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ progress?: number; candidate?: AttackPreview; report?: AttackReport; error?: string }>) => {
      if (settled) return
      if (event.data.candidate) { options.onCandidate?.(event.data.candidate); return }
      if (event.data.progress !== undefined) { options.onProgress?.(event.data.progress); return }
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else if (event.data.report) { options.onProgress?.(1); resolve(event.data.report) }
      else reject(new Error('Attack worker returned no evidence.'))
    }
    worker.onerror = event => { if (settled) return; cleanup(); reject(new Error(event.message || 'Attack worker failed.')) }
    if (options.signal?.aborted) { abort(); return }
    worker.postMessage({ config, budget: options.budget, previousReport: options.previousReport })
  })
}
