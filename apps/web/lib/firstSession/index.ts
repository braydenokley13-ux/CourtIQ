/**
 * Phase 5 — First Great Session.
 *
 * The deterministic 5-rep arc a brand-new player walks through in
 * their first 10–15 minutes. See ./script.ts for the arc definition
 * and the FIRST_SESSION_SCRIPT constant.
 *
 * Consumers:
 *   - scenarioService.generateSessionBundle: when the user has 0 prior
 *     attempts, call composeFirstSession(catalog) and pin the bundle.
 *   - /train: read the per-rep `uiMode` and toggle chrome accordingly.
 *   - /train summary: read isInFirstSession() to render the small,
 *     calm summary card.
 *
 * The arc is *not* part of the adaptive routing. It runs ahead of
 * Phase 4 — the player must first see the basketball before the
 * recognition heuristics have anything to recognize.
 */
export {
  FIRST_SESSION_SCRIPT,
  isInFirstSession,
  getFirstSessionStep,
  NORMAL_UI_MODE,
} from './script'
export type { FirstSessionStep, FirstSessionUiMode } from './script'

export { composeFirstSession, parseScenarioVariantTags } from './compose'
export type { CatalogScenario, ComposedFirstSession, ComposedStep } from './compose'
