/**
 * pack-2 (phase-δ) — centralized feature-flag scaffolding.
 *
 * Flags are sourced from the `FEATURE_FLAGS` env var as a CSV of
 * names. SME-reviewed decoder content can be flipped to LIVE without
 * a code deploy by adding its flag name to that variable.
 */

export type FeatureFlag = 'hunt_decoder_v0_live' | 'drop_decoder_v0_live'

// Structural subset of NodeJS.ProcessEnv. Accepting a plain dict
// here keeps the call sites — including tests — free of the
// Next-injected required keys (NODE_ENV etc.) while still satisfying
// `process.env` as a default argument.
export type FeatureFlagEnv = { [key: string]: string | undefined }

export function isEnabled(
  flag: FeatureFlag,
  env: FeatureFlagEnv = process.env,
): boolean {
  const raw = env.FEATURE_FLAGS
  if (!raw) return false

  const enabled = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return enabled.includes(flag)
}
