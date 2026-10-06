import { stress } from '@courtiq/basketball/stressCore'
import type { LabConfig } from '@courtiq/basketball/types'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ config: LabConfig; beforeConfig?: LabConfig }>) => void) | null
  postMessage: (message: unknown) => void
}
scope.onmessage = (event) => {
  try {
    scope.postMessage({
      report: stress(event.data.config, event.data.beforeConfig, (progress) => scope.postMessage({ progress })),
    })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Stress analysis failed.' })
  }
}
