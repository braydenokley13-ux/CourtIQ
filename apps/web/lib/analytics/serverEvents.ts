import type { EventMap } from './events'

/**
 * Server-safe analytics shim. Wire this to PostHog server SDK when credentials are available.
 */
export function captureServerEvent<E extends keyof EventMap>(
  event: E,
  properties: EventMap[E],
): void {
  // eslint-disable-next-line no-console
  console.info(`[analytics] ${event}`, properties)
}
