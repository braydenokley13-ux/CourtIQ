import { attack } from '@courtiq/basketball/attackCore'
import type { AttackReport } from '@courtiq/basketball/attackCore'
import type { LabConfig } from '@courtiq/basketball/types'
const scope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<{ config: LabConfig; budget?: number; previousReport?: AttackReport }>) => void)
    | null
  postMessage: (message: unknown) => void
}
scope.onmessage = (event) => {
  try {
    scope.postMessage({
      report: attack(event.data.config, {
        budget: event.data.budget,
        previousReport: event.data.previousReport,
        onProgress: (progress) => scope.postMessage({ progress }),
        onCandidate: (candidate) => scope.postMessage({ candidate }),
      }),
    })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Attack failed.' })
  }
}
