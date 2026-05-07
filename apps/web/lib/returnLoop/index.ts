/**
 * Phase 6 — Return Loop barrel.
 *
 * Classifier + composer that decide what a returning player sees on
 * their second / third / weekly / monthly visit. Pure functions —
 * inputs hydrated from Profile.last_session_at + Phase 4 decoder
 * confidences + the LIVE catalog.
 */
export { classifyReturn, returnBanner } from './classifyReturn'
export type { ReturnContext, ClassifyReturnInput } from './classifyReturn'

export { composeReturnSession, strongestDecoder } from './composeReturn'
export type {
  ComposeReturnInput,
  ComposedReturnSession,
  ComposedReturnRep,
  ReturnSlot,
  ReturnCatalogScenario,
} from './composeReturn'
