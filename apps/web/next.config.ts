import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Expose the Vercel git SHA so client-side Sentry can tag releases.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    // P3.3A — production GLB asset gates. `NEXT_PUBLIC_*` vars are
    // already inlined automatically by Next.js, but listing them
    // here keeps the public surface explicit and ensures the value
    // is captured at build time even when the var is read on a
    // server module path. See
    // `apps/web/components/scenario3d/imperativeScene.ts`
    // (`isGlbAthletePreviewActive` and companions) and
    // `docs/qa/production-glb-loading.md`.
    NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW:
      process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW ?? '',
    NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP ?? '',
    NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP:
      process.env.NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP ?? '',
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? 'courtiq',
  project: process.env.SENTRY_PROJECT ?? 'web',
  silent: true,
  widenClientFileUpload: true,
  reactComponentAnnotation: { enabled: true },
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
})
