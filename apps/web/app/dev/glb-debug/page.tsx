import { Suspense } from 'react'
import { GlbDebugClient } from './GlbDebugClient'

export const dynamic = 'force-dynamic'

/**
 * P3.3B — production-safe GLB debug readout.
 *
 * Exposes only `NEXT_PUBLIC_*` flag values + runtime gate state +
 * canonical asset URLs. Every value rendered here is already public
 * by definition (NEXT_PUBLIC_* vars are inlined into the client
 * bundle and visible to anyone who views source), so this page is
 * safe to ship in production. It is not linked from the rest of the
 * app and lives under `/dev/`, which middleware (`DEV_PUBLIC_PREFIX`)
 * already routes around the Supabase auth refresh — so prod QA can
 * hit it without an account.
 *
 * Specifically reports:
 *   - the three `NEXT_PUBLIC_*` env-flag values as the *client bundle*
 *     sees them (the static-read pattern that webpack DefinePlugin
 *     actually inlines), so a misconfigured Vercel env or a stale
 *     build cache surfaces here unambiguously
 *   - the runtime gate booleans the renderer consults
 *     (`isGlbAthletePreviewActive`, `isImportedCloseoutClipActive`,
 *     `isImportedBackCutClipActive`)
 *   - the asset URLs the GLB loader requests, so a network-tab cross
 *     reference is one line away
 *   - `NEXT_PUBLIC_COMMIT_SHA` so QA can confirm the deployed commit
 *     actually contains the P3.3B fix (env-var changes alone don't
 *     help if Vercel is serving a cached pre-fix build)
 */
export default function GlbDebugPage() {
  // Build-time inlined: webpack's DefinePlugin replaces the static
  // `process.env.NEXT_PUBLIC_*` references with their values from the
  // build environment. Reading them here at request time on the
  // server is fine because Next.js guarantees the same value is
  // baked into the client bundle, but the *client* version of this
  // page is what really matters — see GlbDebugClient.
  const serverEnv = {
    NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW:
      process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
    NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
    NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
    NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
    NODE_ENV: process.env.NODE_ENV ?? 'unknown',
  }

  return (
    <Suspense fallback={null}>
      <GlbDebugClient serverEnv={serverEnv} />
    </Suspense>
  )
}
