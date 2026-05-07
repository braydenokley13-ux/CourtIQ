import type { EventMap } from './events'

/**
 * Server-safe analytics shim.
 *
 * Currently a console.info stub — PostHog server SDK (posthog-node)
 * isn't installed in this env. The optional `distinctId` argument
 * standardizes the call shape so that when the SDK is wired (Phase
 * 12), call sites don't need to change.
 *
 * Once posthog-node lands, the body becomes:
 *
 *     posthog.capture({
 *       distinctId: distinctId ?? 'anonymous',
 *       event,
 *       properties,
 *     })
 *
 * See docs/analytics/daily-dashboards.md for the dashboard queries
 * that consume the daily_started / daily_completed / daily_shared
 * events.
 */
export function captureServerEvent<E extends keyof EventMap>(
  event: E,
  properties: EventMap[E],
  distinctId?: string,
): void {
  // eslint-disable-next-line no-console
  console.info(`[analytics] ${event}`, { ...properties, distinctId })
}
