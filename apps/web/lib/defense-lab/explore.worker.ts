import { explore } from './explore'
import type { LabConfig } from './types'
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ config: LabConfig; max?: number; withFrames?: boolean }>) => void) | null
  postMessage: (message: unknown) => void
}
scope.onmessage = event => {
  try { scope.postMessage({ report: explore(event.data.config, { max: event.data.max, withFrames: event.data.withFrames }) }) }
  catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'Explore failed.' }) }
}
