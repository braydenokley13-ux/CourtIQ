import { explore, robustness } from '@courtiq/basketball/explore'
import type { TeachingMoment } from '@courtiq/basketball/explore'
import type { LabConfig } from '@courtiq/basketball/types'
type Request =
  | { kind?: 'explore'; config: LabConfig; max?: number; withFrames?: boolean }
  | { kind: 'robustness'; config: LabConfig; samples?: number; moment?: TeachingMoment | null }
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}
scope.onmessage = (event) => {
  try {
    const request = event.data
    if (request.kind === 'robustness')
      scope.postMessage({
        robustness: robustness(request.config, {
          samples: request.samples,
          moment: request.moment,
          now: () => performance.now(),
        }),
      })
    else scope.postMessage({ report: explore(request.config, { max: request.max, withFrames: request.withFrames }) })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Explore failed.' })
  }
}
